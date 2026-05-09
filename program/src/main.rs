#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_consensus::{transaction::SignerRecoverable, Header, Transaction, TxEnvelope};
use alloy_eips::eip2718::Decodable2718;
use alloy_primitives::{keccak256, Address, Bytes, B256, U256};
use alloy_rlp::{encode as rlp_encode, BufMut, Encodable, Header as RlpHeader};
use serde::{Deserialize, Serialize};
use serde_with::serde_as;

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
/// Input for proving transaction inclusion at a precise index in an Ethereum block
pub struct TransactionInclusionInput {
    #[serde_as(as = "alloy_consensus::serde_bincode_compat::Header")]
    pub block_header: Header,
    #[serde_as(as = "alloy_consensus::serde_bincode_compat::Header")]
    pub parent_block_header: Header,
    /// The signed user transaction the proposer promised could be included.
    pub committed_raw_transaction: Bytes,
    /// Sender account state proved against `parent_block_header.state_root`.
    pub sender_account: AccountState,
    pub sender_account_proof: Vec<Bytes>,
    /// Transaction value stored at `transaction_index`, when proving inclusion of a different tx.
    pub raw_transaction: Bytes,
    /// The precise index where the transaction should be located in the block
    pub transaction_index: u64,
    pub merkle_proof: Vec<Bytes>,
    /// When true, prove that no transaction exists at the precise index.
    pub prove_absence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
/// Proof result showing whether a transaction is included at the expected precise index
pub struct TransactionInclusionProof {
    pub block_hash: B256,
    pub block_number: u64,
    pub committed_transaction_hash: B256,
    pub transaction_hash: B256,
    pub transaction_index: u64,
    pub is_included: bool,
    pub transaction_can_be_included: bool,
    pub verified_against_root: B256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountState {
    pub nonce: u64,
    pub balance: U256,
    pub storage_root: B256,
    pub code_hash: B256,
}

// Import alloy-sol-types for ABI encoding
use alloy_sol_types::SolType;

// Define the Solidity-compatible struct for ABI encoding
alloy_sol_types::sol! {
    struct PublicValuesStruct {
        bytes32 blockHash;
        uint64 blockNumber;
        bytes32 committedTransactionHash;
        bytes32 transactionHash;
        uint64 transactionIndex;
        bool isIncluded;
        bool transactionCanBeIncluded;
        bytes32 verifiedAgainstRoot;
    }
}

impl Encodable for AccountState {
    fn encode(&self, out: &mut dyn BufMut) {
        RlpHeader { list: true, payload_length: self.payload_length() }.encode(out);
        self.nonce.encode(out);
        self.balance.encode(out);
        self.storage_root.encode(out);
        self.code_hash.encode(out);
    }

    fn length(&self) -> usize {
        let payload_length = self.payload_length();
        RlpHeader { list: true, payload_length }.length() + payload_length
    }
}

impl AccountState {
    fn payload_length(&self) -> usize {
        self.nonce.length()
            + self.balance.length()
            + self.storage_root.length()
            + self.code_hash.length()
    }
}

/// Verify Merkle Patricia Trie inclusion proof for transaction at precise index using alloy-trie
fn verify_merkle_proof(
    key: &[u8],
    transaction_data: Option<Vec<u8>>,
    proof: &[Bytes],
    root: B256,
) -> bool {
    use alloy_trie::{proof::verify_proof, Nibbles};

    println!(
        "Verifying MPT proof using alloy-trie with {} proof nodes",
        proof.len()
    );

    // Convert key to nibbles (proper MPT format)
    let key_nibbles = Nibbles::unpack(key);
    println!("Target key nibbles: {:?}", key_nibbles);
    if let Some(transaction_data) = &transaction_data {
        println!("Target transaction size: {} bytes", transaction_data.len());
    } else {
        println!("Proving no transaction at target index");
    }
    println!("Expected root: {:?}", root);

    // Use alloy-trie's built-in proof verification
    // verify_proof expects IntoIterator<Item = &Bytes>
    match verify_proof(
        root,
        key_nibbles.clone(),
        transaction_data, // Some(value) for inclusion, None for absence
        proof,            // Pass the proof slice directly
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

fn verify_account_proof(address: Address, account: &AccountState, proof: &[Bytes], root: B256) -> bool {
    use alloy_trie::{proof::verify_proof, Nibbles};

    let key = keccak256(address);
    let key_nibbles = Nibbles::unpack(key.as_slice());
    let account_rlp = rlp_encode(account);

    match verify_proof(root, key_nibbles, Some(account_rlp), proof) {
        Ok(()) => {
            println!("✓ Account state proof verified against parent state root");
            true
        }
        Err(e) => {
            println!("✗ Account state proof verification failed: {:?}", e);
            false
        }
    }
}

fn transaction_can_be_included(
    raw_transaction: &[u8],
    parent_header: &Header,
    target_header: &Header,
    sender_account: &AccountState,
    sender_account_proof: &[Bytes],
) -> bool {
    if target_header.number != parent_header.number + 1 {
        println!("✗ Target block is not the direct child of the parent block");
        return false;
    }
    if target_header.parent_hash != parent_header.hash_slow() {
        println!("✗ Target block parent hash does not match supplied parent header");
        return false;
    }

    let tx = match TxEnvelope::decode_2718_exact(raw_transaction) {
        Ok(tx) => tx,
        Err(e) => {
            println!("✗ Committed transaction decoding failed: {:?}", e);
            return false;
        }
    };
    let sender = match tx.recover_signer() {
        Ok(sender) => sender,
        Err(e) => {
            println!("✗ Committed transaction signer recovery failed: {:?}", e);
            return false;
        }
    };

    if !verify_account_proof(
        sender,
        sender_account,
        sender_account_proof,
        parent_header.state_root,
    ) {
        return false;
    }

    if sender_account.nonce != tx.nonce() {
        println!(
            "✗ Sender nonce mismatch: account nonce {}, transaction nonce {}",
            sender_account.nonce,
            tx.nonce()
        );
        return false;
    }

    if let Some(base_fee) = target_header.base_fee_per_gas {
        if tx.effective_tip_per_gas(base_fee).is_none() {
            println!("✗ Transaction max fee/gas price is below the target block base fee");
            return false;
        }
    }

    let gas_cost = U256::from(tx.gas_limit()) * U256::from(tx.max_fee_per_gas());
    let blob_cost = match (tx.blob_gas_used(), tx.max_fee_per_blob_gas()) {
        (Some(blob_gas_used), Some(max_fee_per_blob_gas)) => {
            U256::from(blob_gas_used) * U256::from(max_fee_per_blob_gas)
        }
        _ => U256::ZERO,
    };
    let Some(upfront_cost) = gas_cost
        .checked_add(blob_cost)
        .and_then(|cost| cost.checked_add(tx.value()))
    else {
        println!("✗ Transaction upfront cost overflowed");
        return false;
    };

    if sender_account.balance < upfront_cost {
        println!(
            "✗ Sender balance is too low: balance {}, upfront cost {}",
            sender_account.balance, upfront_cost
        );
        return false;
    }

    true
}

pub fn main() {
    let input_bytes = sp1_zkvm::io::read::<Vec<u8>>();
    let input: TransactionInclusionInput = bincode::deserialize(&input_bytes).unwrap();

    // Validate block header consistency
    let computed_block_hash = input.block_header.hash_slow();
    let committed_tx_hash = keccak256(&input.committed_raw_transaction);
    let committed_tx_can_be_included = transaction_can_be_included(
        &input.committed_raw_transaction,
        &input.parent_block_header,
        &input.block_header,
        &input.sender_account,
        &input.sender_account_proof,
    );
    assert!(
        committed_tx_can_be_included,
        "committed transaction must be includable at the target block"
    );

    // Absence proofs use a zero transaction hash sentinel.
    let target_tx_hash = if input.prove_absence {
        B256::ZERO
    } else {
        keccak256(&input.raw_transaction)
    };

    // RLP encode the transaction index as the key
    let key = rlp_encode(input.transaction_index);

    // Verify the transaction is included using the Merkle proof
    let is_included = if input.prove_absence {
        !verify_merkle_proof(
            &key,
            None,
            &input.merkle_proof,
            input.block_header.transactions_root,
        )
    } else {
        verify_merkle_proof(
            &key,
            Some(input.raw_transaction.to_vec()),
            &input.merkle_proof,
            input.block_header.transactions_root,
        )
    };

    let proof = TransactionInclusionProof {
        block_hash: computed_block_hash,
        block_number: input.block_header.number,
        committed_transaction_hash: committed_tx_hash,
        transaction_hash: target_tx_hash,
        transaction_index: input.transaction_index,
        is_included,
        transaction_can_be_included: committed_tx_can_be_included,
        verified_against_root: input.block_header.transactions_root,
    };

    // Create Solidity-compatible struct for ABI encoding
    let solidity_public_values = PublicValuesStruct {
        blockHash: proof.block_hash,
        blockNumber: proof.block_number,
        committedTransactionHash: proof.committed_transaction_hash,
        transactionHash: proof.transaction_hash,
        transactionIndex: proof.transaction_index,
        isIncluded: proof.is_included,
        transactionCanBeIncluded: proof.transaction_can_be_included,
        verifiedAgainstRoot: proof.verified_against_root,
    };

    // Commit ABI-encoded public values (compatible with Solidity)
    sp1_zkvm::io::commit_slice(&PublicValuesStruct::abi_encode(&solidity_public_values));
}
