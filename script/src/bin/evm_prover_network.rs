//! EVM-compatible proof generation using Succinct Prover Network
//! 
//! Usage:
//! ```shell
//! RUST_LOG=info cargo run --release --bin evm_network -- --system groth16
//! ```

use alloy::network::Ethereum;
use alloy::providers::{Provider, RootProvider};
use alloy_rpc_types::BlockId;
use clap::{Parser, ValueEnum};
use eyre::Result;
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    include_elf, HashableKey, ProverClient, SP1ProofWithPublicValues, SP1Stdin, SP1VerifyingKey,
    network::FulfillmentStrategy, Prover,
};
use std::path::PathBuf;
use tx_inclusion_precise_index_lib::{
    generate_merkle_proof, TransactionInclusionInput, TransactionInclusionProof, INCLUDED_TX,
};
use url::Url;

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
pub const TX_INCLUSION_ELF: &[u8] = include_elf!("tx-inclusion-precise-index-client");

/// The arguments for the EVM command.
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct EVMArgs {
    #[arg(long, default_value = "https://ethereum-rpc.publicnode.com")]
    eth_rpc_url: Url,
    #[arg(long, value_enum, default_value = "groth16")]
    system: ProofSystem,
}

/// Enum representing the available proof systems
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum ProofSystem {
    Plonk,
    Groth16,
}

/// A fixture that can be used to test the verification of SP1 zkVM proofs inside Solidity.
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

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();

    // Parse the command line arguments.
    let args = EVMArgs::parse();
    
    // Verify network configuration
    if std::env::var("NETWORK_PRIVATE_KEY").is_err() {
        eprintln!("Error: NETWORK_PRIVATE_KEY environment variable is required for network mode");
        eprintln!("Make sure your .env file contains: NETWORK_PRIVATE_KEY=0x...");
        std::process::exit(1);
    }
    println!("✅ Network private key found in environment");

    let provider = RootProvider::<Ethereum>::new_http(args.eth_rpc_url.clone());

    println!("Generating EVM-compatible proof for transaction inclusion verification");
    println!("Using Succinct Prover Network with {:?} proof system", args.system);

    // Setup the network prover client
    let client = ProverClient::builder().network().build();
    let (pk, vk) = client.setup(TX_INCLUSION_ELF);

    // Get the transaction details
    let tx = provider
        .get_transaction_by_hash(INCLUDED_TX.parse()?)
        .await?
        .ok_or_else(|| eyre::eyre!("Transaction not found"))?;

    let block_number = tx
        .block_number
        .ok_or_else(|| eyre::eyre!("Transaction not mined"))?;
    let tx_index = tx
        .transaction_index
        .ok_or_else(|| eyre::eyre!("Transaction index not found"))? as u64;

    println!(
        "Transaction found in block: {}, index: {}",
        block_number, tx_index
    );

    // Get the block with all transactions
    let block = provider
        .get_block(BlockId::Number(block_number.into()))
        .await?
        .ok_or_else(|| eyre::eyre!("Block not found"))?;

    // Generate Merkle proof
    let (merkle_proof, encoded_tx_bytes) =
        generate_merkle_proof(&provider, block_number, tx_index).await?;

    let input = TransactionInclusionInput {
        block_header: block.header.clone().into(),
        raw_transaction: encoded_tx_bytes,
        transaction_index: tx_index,
        merkle_proof,
    };

    // Serialize input
    let input_bytes = bincode::serialize(&input)?;
    let mut stdin = SP1Stdin::new();
    stdin.write(&input_bytes);

    println!("\n=== SUBMITTING PROOF REQUEST ===");
    println!("Submitting {} proof request to Succinct Prover Network...", match args.system {
        ProofSystem::Plonk => "PLONK",
        ProofSystem::Groth16 => "Groth16"
    });

    // Generate the proof using network
    let proof = match args.system {
        ProofSystem::Plonk => {
            client.prove(&pk, &stdin)
                .plonk()
                .strategy(FulfillmentStrategy::Auction)
                .run_async()
                .await
                .map_err(|e| eyre::eyre!("PLONK proof generation failed: {}", e))?
        }
        ProofSystem::Groth16 => {
            client.prove(&pk, &stdin)
                .groth16()
                .strategy(FulfillmentStrategy::Auction)
                .run_async()
                .await
                .map_err(|e| eyre::eyre!("Groth16 proof generation failed: {}", e))?
        }
    };

    println!("✅ EVM-compatible proof generated successfully using Succinct Prover Network!");
    println!("Proof generation completed via the network - no local resources required!");

    // Create and save fixture
    create_proof_fixture(&proof, &vk, args.system).await?;

    Ok(())
}

/// Create a fixture for the given proof.
async fn create_proof_fixture(
    proof: &SP1ProofWithPublicValues,
    vk: &SP1VerifyingKey,
    system: ProofSystem,
) -> Result<()> {
    // Deserialize the public values from the ZK proof output
    let bytes = proof.public_values.as_slice();
    let proof_result: TransactionInclusionProof = bincode::deserialize(bytes)?;

    // Create Solidity-compatible ABI-encoded public values
    // This must match the PublicValuesStruct in the Solidity contract
    use alloy::sol_types::SolType;
    
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
    
    let solidity_public_values = PublicValuesStruct {
        blockHash: proof_result.block_hash.into(),
        blockNumber: proof_result.block_number,
        transactionHash: proof_result.transaction_hash.into(),
        transactionIndex: proof_result.transaction_index,
        isIncluded: proof_result.is_included,
        verifiedAgainstRoot: proof_result.verified_against_root.into(),
    };
    
    let abi_encoded_public_values = PublicValuesStruct::abi_encode(&solidity_public_values);

    // Create the testing fixture so we can test things end-to-end.
    let fixture = SP1TransactionInclusionProofFixture {
        block_hash: format!("0x{}", hex::encode(proof_result.block_hash.as_slice())),
        block_number: proof_result.block_number,
        transaction_hash: format!("0x{}", hex::encode(proof_result.transaction_hash.as_slice())),
        transaction_index: proof_result.transaction_index,
        is_included: proof_result.is_included,
        verified_against_root: format!("0x{}", hex::encode(proof_result.verified_against_root.as_slice())),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(abi_encoded_public_values)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("\n=== EVM PROOF FIXTURE GENERATED ===");
    println!("Verification Key: {}", fixture.vkey);
    println!("Block Hash: {}", fixture.block_hash);
    println!("Block Number: {}", fixture.block_number);
    println!("Transaction Hash: {}", fixture.transaction_hash);
    println!("Transaction Index: {}", fixture.transaction_index);
    println!("Is Included: {}", fixture.is_included);
    println!("Verified Against Root: {}", fixture.verified_against_root);
    println!("Public Values: {}", fixture.public_values);
    println!("Proof Bytes Length: {} bytes", hex::decode(&fixture.proof[2..]).unwrap().len());

    // Save the fixture to a file.
    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures");
    std::fs::create_dir_all(&fixture_path).expect("failed to create fixture path");
    
    let filename = format!("{:?}-fixture.json", system).to_lowercase();
    let fixture_file_path = fixture_path.join(&filename);
    
    std::fs::write(
        &fixture_file_path,
        serde_json::to_string_pretty(&fixture).unwrap(),
    )
    .expect("failed to write fixture");

    println!("\n✅ Fixture saved to: {:?}", fixture_file_path);
    println!("This fixture can be used for on-chain verification testing.");
    println!("\nNext steps:");
    println!("1. Use this fixture in your Solidity tests");
    println!("2. Deploy the verification contract with vkey: {}", fixture.vkey);
    println!("3. Test on-chain verification with the generated proof");

    Ok(())
}