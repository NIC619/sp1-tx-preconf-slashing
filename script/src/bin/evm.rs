//! An end-to-end example of using the SP1 SDK to generate an EVM-compatible proof
//! for transaction inclusion verification that can be verified on-chain.
//!
//! You can run this script using the following command:
//! ```shell
//! RUST_LOG=info cargo run --release --bin evm -- --system groth16
//! ```
//! or
//! ```shell
//! RUST_LOG=info cargo run --release --bin evm -- --system plonk
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
    #[arg(long)]
    local: bool,
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

/// Solidity struct for public values - must match the contract
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PublicValuesStruct {
    block_hash: [u8; 32],
    block_number: u64,
    transaction_hash: [u8; 32],
    transaction_index: u64,
    is_included: bool,
    verified_against_root: [u8; 32],
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();

    // Parse the command line arguments.
    let args = EVMArgs::parse();
    
    // Verify network configuration if not using local mode
    if !args.local {
        if std::env::var("NETWORK_PRIVATE_KEY").is_err() {
            eprintln!("Error: NETWORK_PRIVATE_KEY environment variable is required for network mode");
            eprintln!("Make sure your .env file contains: NETWORK_PRIVATE_KEY=0x...");
            std::process::exit(1);
        }
        println!("✅ Network private key found in environment");
    }
    let provider = RootProvider::<Ethereum>::new_http(args.eth_rpc_url.clone());

    println!("Generating EVM-compatible proof for transaction inclusion verification");
    println!("Proof System: {:?}", args.system);

    // We'll handle setup and proving separately for each client type due to type differences

    // Get the transaction details
    let tx = provider
        .get_transaction_by_hash(INCLUDED_TX.parse()?)
        .await?
        .ok_or_else(|| eyre::eyre!("Transaction not found"))?
;

    let block_number = tx
        .block_number
        .ok_or_else(|| eyre::eyre!("Transaction not mined"))?
;
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
        .ok_or_else(|| eyre::eyre!("Block not found"))?
;

    // Generate Merkle proof
    let (merkle_proof, encoded_tx_bytes) =
        generate_merkle_proof(&provider, block_number, tx_index).await?
;

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

    // Generate the proof based on the selected proof system and mode
    let (proof, vk) = if args.local {
        println!("\nGenerating EVM-compatible proof locally...");
        println!("This requires significant resources (128GB RAM)");
        
        let client = ProverClient::from_env();
        let (pk, vk) = client.setup(TX_INCLUSION_ELF);
        
        let proof = match args.system {
            ProofSystem::Plonk => {
                println!("Generating PLONK proof locally...");
                client.prove(&pk, &stdin).plonk().run()
            }
            ProofSystem::Groth16 => {
                println!("Generating Groth16 proof locally...");
                client.prove(&pk, &stdin).groth16().run()
            }
        }
        .expect("failed to generate proof locally");
        
        (proof, vk)
    } else {
        println!("\nGenerating EVM-compatible proof using Succinct Prover Network...");
        println!("Using {} proof system", match args.system {
            ProofSystem::Plonk => "PLONK",
            ProofSystem::Groth16 => "Groth16"
        });
        
        let client = ProverClient::builder().network().build();
        let (pk, vk) = client.setup(TX_INCLUSION_ELF);
        
        let proof_future = match args.system {
            ProofSystem::Plonk => {
                println!("Submitting PLONK proof request to network...");
                client.prove(&pk, &stdin)
                    .plonk()
                    .strategy(FulfillmentStrategy::Auction)
                    .run_async()
            }
            ProofSystem::Groth16 => {
                println!("Submitting Groth16 proof request to network...");
                client.prove(&pk, &stdin)
                    .groth16()
                    .strategy(FulfillmentStrategy::Auction)
                    .run_async()
            }
        };
        
        println!("\n=== PROOF REQUEST SUBMITTED ===");
        println!("Proof request submitted to Succinct Prover Network!");
        println!("Monitor your proof at: https://explorer.succinct.xyz");
        println!("Waiting for network proof generation...");
        println!("=======================================\n");
        
        let proof = proof_future.await.expect("failed to generate proof using network");
        (proof, vk)
    };

    if args.local {
        println!("✅ EVM-compatible proof generated successfully locally!");
    } else {
        println!("\n✅ EVM-compatible proof generated successfully using Succinct Prover Network!");
        println!("Proof generation completed via the network - no local resources required!");
        println!("Check the Succinct Explorer for detailed metrics and verification info.");
    }

    create_proof_fixture(&proof, &vk, args.system).await?;

    Ok(())
}

/// Create a fixture for the given proof.
async fn create_proof_fixture(
    proof: &SP1ProofWithPublicValues,
    vk: &SP1VerifyingKey,
    system: ProofSystem,
) -> Result<()> {
    // Deserialize the public values.
    let bytes = proof.public_values.as_slice();
    let proof_result: TransactionInclusionProof = bincode::deserialize(bytes)?;

    // Create the testing fixture so we can test things end-to-end.
    let fixture = SP1TransactionInclusionProofFixture {
        block_hash: format!("0x{}", hex::encode(proof_result.block_hash.as_slice())),
        block_number: proof_result.block_number,
        transaction_hash: format!("0x{}", hex::encode(proof_result.transaction_hash.as_slice())),
        transaction_index: proof_result.transaction_index,
        is_included: proof_result.is_included,
        verified_against_root: format!("0x{}", hex::encode(proof_result.verified_against_root.as_slice())),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    // The verification key is used to verify that the proof corresponds to the execution of the
    // program on the given input.
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

    Ok(())
}
