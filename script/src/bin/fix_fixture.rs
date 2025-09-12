//! Fix the fixture to have correct ABI-encoded public values for Solidity

use eyre::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SP1TransactionInclusionProofFixture {
    block_hash: String,
    block_number: u64,
    transaction_hash: String,
    transaction_index: u64,
    is_included: bool,
    verified_against_root: String,
    vkey: String,
    public_values: String,
    proof: String,
}

fn main() -> Result<()> {
    // Read the existing fixture
    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures/groth16-fixture.json");
    let fixture_content = std::fs::read_to_string(&fixture_path)?;
    let mut fixture: SP1TransactionInclusionProofFixture = serde_json::from_str(&fixture_content)?;

    println!("Original fixture loaded:");
    println!("Block Hash: {}", fixture.block_hash);
    println!("Block Number: {}", fixture.block_number);
    println!("Transaction Hash: {}", fixture.transaction_hash);
    println!("Transaction Index: {}", fixture.transaction_index);
    println!("Is Included: {}", fixture.is_included);
    println!("Verified Against Root: {}", fixture.verified_against_root);

    // Create Solidity-compatible ABI-encoded public values using alloy
    use alloy::sol_types::{SolType};
    
    alloy::sol! {
        struct PublicValuesStruct {
            bytes32 blockHash;
            uint64 blockNumber;
            bytes32 transactionHash;
            uint64 transactionIndex;
            bool isIncluded;
            bytes32 verifiedAgainstRoot;
        }
    }
    
    // Parse the hex strings to bytes32
    let block_hash_bytes: [u8; 32] = hex::decode(&fixture.block_hash[2..])?.try_into().unwrap();
    let tx_hash_bytes: [u8; 32] = hex::decode(&fixture.transaction_hash[2..])?.try_into().unwrap();
    let root_bytes: [u8; 32] = hex::decode(&fixture.verified_against_root[2..])?.try_into().unwrap();
    
    let solidity_public_values = PublicValuesStruct {
        blockHash: block_hash_bytes.into(),
        blockNumber: fixture.block_number,
        transactionHash: tx_hash_bytes.into(),
        transactionIndex: fixture.transaction_index,
        isIncluded: fixture.is_included,
        verifiedAgainstRoot: root_bytes.into(),
    };
    
    let abi_encoded_public_values = PublicValuesStruct::abi_encode(&solidity_public_values);

    // Update the fixture with correct ABI encoding
    fixture.public_values = format!("0x{}", hex::encode(abi_encoded_public_values));

    println!("\n=== UPDATED FIXTURE ===");
    println!("New Public Values: {}", fixture.public_values);
    println!("Public Values Length: {} bytes", hex::decode(&fixture.public_values[2..]).unwrap().len());

    // Save the updated fixture
    let updated_fixture_content = serde_json::to_string_pretty(&fixture)?;
    std::fs::write(&fixture_path, updated_fixture_content)?;

    println!("\n✅ Fixture updated with correct ABI-encoded public values!");
    println!("The test should now work correctly.");

    Ok(())
}