use alloy::providers::Provider;
use alloy_consensus::Header;
use alloy_primitives::{Bytes, B256};
use alloy_rpc_types::{BlockId, BlockTransactions};
use eyre::Result;
use serde::{Deserialize, Serialize};
use serde_with::serde_as;

// Test transaction hashes
pub const INCLUDED_TX: &str = "0x9bd463b17765f462c6e24ded54663ab87cc2babca5ac7c94a704273f746b44c7";

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
/// Input for proving transaction inclusion at a precise index in an Ethereum block
pub struct TransactionInclusionInput {
    #[serde_as(as = "alloy_consensus::serde_bincode_compat::Header")]
    pub block_header: Header,
    pub raw_transaction: Bytes,
    /// The precise index where the transaction should be located in the block
    pub transaction_index: u64,
    pub merkle_proof: Vec<Bytes>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
/// Proof result showing whether a transaction is included at the expected precise index
pub struct TransactionInclusionProof {
    pub block_hash: B256,
    pub block_number: u64,
    pub transaction_hash: B256,
    pub transaction_index: u64,
    pub is_included: bool,
    pub verified_against_root: B256,
}

/// Generate real Merkle proof for a transaction at a precise index in a block with exact Ethereum encoding
pub async fn generate_merkle_proof(
    provider: &impl Provider,
    block_number: u64,
    tx_index: u64,
) -> Result<(Vec<Bytes>, Bytes)> {
    use alloy_primitives::U256;
    use alloy_rlp::encode as rlp_encode;
    use alloy_trie::{proof::ProofRetainer, HashBuilder, Nibbles};

    println!(
        "Generating Merkle proof for transaction at precise index {} in block {} using alloy-trie",
        tx_index, block_number
    );

    // Fetch the block with FULL transaction details

    let block = provider
        .get_block(BlockId::Number(block_number.into()))
        .full()
        .await?
        .ok_or_else(|| eyre::eyre!("Block not found: {}", block_number))?;

    // Extract full transactions from block (we requested .full() so should always get Full variant)
    let complete_transactions = match &block.transactions {
        BlockTransactions::Full(txs) => {
            println!("Got {} full transactions from block", txs.len());
            txs.clone()
        }
        BlockTransactions::Hashes(_) => {
            return Err(eyre::eyre!(
                "Expected full transactions but got hashes - ensure .full() is used"
            ));
        }
        _ => {
            return Err(eyre::eyre!("Unexpected transaction format"));
        }
    };

    if tx_index as usize >= complete_transactions.len() {
        return Err(eyre::eyre!(
            "Transaction index {} out of range (max: {})",
            tx_index,
            complete_transactions.len() - 1
        ));
    }

    println!(
        "Successfully got all {} transactions from block!",
        complete_transactions.len()
    );
    println!("Building Ethereum transaction trie using alloy-trie with proof generation...");

    // Step 1: Create ProofRetainer and configure it with the target transaction key
    let target_key = rlp_encode(U256::from(tx_index));
    let target_nibbles = Nibbles::unpack(&target_key);

    // ProofRetainer needs to know the target keys BEFORE trie construction
    let proof_retainer = ProofRetainer::from_iter([target_nibbles.clone()]);
    let mut trie_builder = HashBuilder::default().with_proof_retainer(proof_retainer);

    // Step 2: Prepare transaction data
    let mut encoded_transactions = Vec::with_capacity(complete_transactions.len());
    let mut key_value_pairs = Vec::new();

    for (i, tx) in complete_transactions.iter().enumerate() {
        // Generate transaction key using proper RLP encoding of index
        let key = rlp_encode(U256::from(i));
        let nibbles = Nibbles::unpack(&key);

        // Encode the transaction using EXACT EIP-2718 encoding
        let encoded_tx = encode_transaction_for_trie(tx)?;
        encoded_transactions.push(encoded_tx.clone());

        key_value_pairs.push((nibbles, encoded_tx));
    }

    // Step 3: Sort by key to ensure proper trie construction
    key_value_pairs.sort_by(|a, b| a.0.cmp(&b.0));

    // Step 4: Add all transactions to trie (this populates the ProofRetainer)
    for (nibbles, encoded_tx) in key_value_pairs.iter() {
        trie_builder.add_leaf(nibbles.clone(), encoded_tx);
    }

    // Step 5: Get the trie root and validate
    let computed_root = trie_builder.root();
    let block_root = block.header.transactions_root;

    println!("\n=== TRIE ROOT COMPARISON ===");
    println!("Computed trie root: {:?}", computed_root);
    println!("Block transactions root: {:?}", block_root);

    if computed_root != block_root {
        println!("❌ WARNING: Transaction roots do not match!");
        println!("   Computed: {:?}", computed_root);
        println!("   Expected: {:?}", block_root);
        println!("   Continuing with computed root for proof generation...");
    } else {
        println!("🎉 SUCCESS: Trie root MATCHES block transactions root!");
    }

    // Step 6: Extract the proper MPT proof from ProofRetainer
    let target_tx_encoded = &encoded_transactions[tx_index as usize];

    println!(
        "\nExtracting Merkle proof for transaction at index {}...",
        tx_index
    );

    // Extract the proof nodes that ProofRetainer captured during trie construction
    let proof_nodes = trie_builder.take_proof_nodes();

    // Convert ProofNodes to Vec<Bytes> using built-in sorting
    let proof_bytes: Vec<Bytes> = proof_nodes
        .into_nodes_sorted()
        .into_iter()
        .map(|(_, bytes)| bytes)
        .collect();

    println!(
        "Extracted {} proof nodes from ProofRetainer (using built-in sorting)",
        proof_bytes.len()
    );

    // Step 7: Validate the merkle proof before sending to client
    println!("\nValidating generated merkle proof...");
    use alloy_trie::proof::verify_proof;

    match verify_proof(
        computed_root,
        target_nibbles,
        Some(target_tx_encoded.to_vec()),
        &proof_bytes,
    ) {
        Ok(()) => {
            println!("✅ Host validation successful - merkle proof is valid!");
        }
        Err(e) => {
            println!("❌ Host validation failed: {:?}", e);
            return Err(eyre::eyre!("Generated merkle proof failed validation: {:?}", e));
        }
    }

    println!("\n=== MERKLE PROOF GENERATED ===");
    println!(
        "Generated Merkle proof with {} nodes using alloy-trie",
        proof_bytes.len()
    );
    println!("Target transaction index: {}", tx_index);
    println!(
        "Encoded transaction size: {} bytes",
        target_tx_encoded.len()
    );
    println!("Trie root: {:?}", computed_root);

    Ok((proof_bytes, target_tx_encoded.clone()))
}

/// Encode transaction for trie using the exact Ethereum format
pub fn encode_transaction_for_trie(tx: &alloy_rpc_types::Transaction) -> Result<Bytes> {
    use alloy_eips::eip2718::Encodable2718;

    // println!("Encoding transaction hash: {}", tx.inner.hash());

    // Use Alloy's built-in EIP-2718 encoding which should match Ethereum exactly
    // This handles all transaction types with proper prefixes and RLP encoding
    let encoded_bytes = tx.inner.encoded_2718();

    // println!("Used EIP-2718 encoded transaction: {} bytes", encoded_bytes.len());
    Ok(Bytes::from(encoded_bytes))
}