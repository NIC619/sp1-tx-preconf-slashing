#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_consensus::Header;
use alloy_primitives::{keccak256, Bytes, B256};
use alloy_rlp::encode as rlp_encode;
use serde::{Deserialize, Serialize};
use serde_with::serde_as;

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

// Removed old MPT verification helper functions - now using alloy-trie's verify_proof

/// Verify Merkle Patricia Trie inclusion proof for transaction at precise index using alloy-trie
fn verify_merkle_proof(key: &[u8], transaction_data: &[u8], proof: &[Bytes], root: B256) -> bool {
    use alloy_trie::{proof::verify_proof, Nibbles};

    if proof.is_empty() {
        println!("✗ Proof is empty");
        return false;
    }

    println!(
        "Verifying MPT proof using alloy-trie with {} proof nodes",
        proof.len()
    );

    // Convert key to nibbles (proper MPT format)
    let key_nibbles = Nibbles::unpack(key);
    println!("Target key nibbles: {:?}", key_nibbles);
    println!("Target transaction size: {} bytes", transaction_data.len());
    println!("Expected root: {:?}", root);

    // Use alloy-trie's built-in proof verification
    // verify_proof expects IntoIterator<Item = &Bytes>
    match verify_proof(
        root,
        key_nibbles.clone(),
        Some(transaction_data.to_vec()), // Expected value at the key
        proof,                           // Pass the proof slice directly
    ) {
        Ok(()) => {
            println!("✓ MPT proof verification successful using alloy-trie!");
            true
        }
        Err(e) => {
            println!("✗ MPT proof verification failed: {:?}", e);
            false
        }
    }
}

pub fn main() {
    let input_bytes = sp1_zkvm::io::read::<Vec<u8>>();
    let input: TransactionInclusionInput = bincode::deserialize(&input_bytes).unwrap();

    // Validate block header consistency
    let computed_block_hash = input.block_header.hash_slow();

    // Get the transaction hash
    let target_tx_hash = keccak256(&input.raw_transaction);

    // RLP encode the transaction index as the key
    let key = rlp_encode(input.transaction_index);

    // Verify the transaction is included using the Merkle proof
    let is_included = verify_merkle_proof(
        &key,
        &input.raw_transaction,
        &input.merkle_proof,
        input.block_header.transactions_root,
    );

    let proof = TransactionInclusionProof {
        block_hash: computed_block_hash,
        block_number: input.block_header.number,
        transaction_hash: target_tx_hash,
        transaction_index: input.transaction_index,
        is_included,
        verified_against_root: input.block_header.transactions_root,
    };

    // Commit the proof to public values
    sp1_zkvm::io::commit_slice(&bincode::serialize(&proof).unwrap());
}
