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
//!
//! To use the Succinct Prover Network, set `SP1_PROVER=network` and provide
//! `NETWORK_PRIVATE_KEY`, then run the same command.

use alloy::network::Ethereum;
use alloy::providers::{Provider, RootProvider};
use alloy_rpc_types::BlockId;
use clap::{Parser, ValueEnum};
use eyre::Result;
use sp1_sdk::{include_elf, Elf, ProveRequest, Prover, ProverClient, ProvingKey, SP1Stdin};
use tx_inclusion_precise_index::{
    default_fixture_output_path, fixture_from_proof, write_fixture_file,
};
use tx_inclusion_precise_index_lib::{
    generate_merkle_proof, TransactionInclusionInput, INCLUDED_TX,
};
use url::Url;

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
pub const TX_INCLUSION_ELF: Elf = include_elf!("tx-inclusion-precise-index-client");

/// The arguments for the EVM command.
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct EVMArgs {
    #[arg(long, default_value = "https://ethereum-rpc.publicnode.com")]
    eth_rpc_url: Url,
    #[arg(long, value_enum, default_value = "groth16")]
    system: ProofSystem,
    #[arg(long, help = "Optional output path for the generated fixture JSON")]
    output_path: Option<std::path::PathBuf>,
    #[arg(
        long,
        help = "Transaction hash to generate proof for (overrides default)"
    )]
    transaction_hash: Option<String>,
}

/// Enum representing the available proof systems
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum ProofSystem {
    Plonk,
    Groth16,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();

    // Parse the command line arguments.
    let args = EVMArgs::parse();

    let prover_mode = std::env::var("SP1_PROVER").unwrap_or_else(|_| "cpu".to_string());
    if prover_mode == "network" {
        if std::env::var("NETWORK_PRIVATE_KEY").is_err() {
            eprintln!("Error: NETWORK_PRIVATE_KEY environment variable is required when SP1_PROVER=network");
            eprintln!("Make sure your .env file contains: NETWORK_PRIVATE_KEY=0x...");
            std::process::exit(1);
        }
        println!("✅ Network private key found in environment");
    }

    let provider = RootProvider::<Ethereum>::new_http(args.eth_rpc_url.clone());

    println!("Generating EVM-compatible proof for transaction inclusion verification");
    println!("Proof System: {:?}", args.system);
    println!("SP1 prover mode: {}", prover_mode);

    let transaction_hash = args
        .transaction_hash
        .or_else(|| std::env::var("INCLUDED_TX").ok())
        .unwrap_or_else(|| INCLUDED_TX.to_string());

    // Get the transaction details
    let tx = provider
        .get_transaction_by_hash(transaction_hash.parse()?)
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

    let client = ProverClient::from_env().await;
    let pk = client
        .setup(TX_INCLUSION_ELF)
        .await
        .map_err(|e| eyre::eyre!("Setup failed: {}", e))?;
    let proof = match args.system {
        ProofSystem::Plonk => {
            println!("Generating PLONK proof...");
            client.prove(&pk, stdin).plonk().await
        }
        ProofSystem::Groth16 => {
            println!("Generating Groth16 proof...");
            client.prove(&pk, stdin).groth16().await
        }
    }
    .map_err(|e| eyre::eyre!("Proof generation failed: {}", e))?;

    if prover_mode == "network" {
        println!("\n✅ EVM-compatible proof generated successfully using Succinct Prover Network!");
        println!("Proof generation completed via the network - no local resources required!");
        println!("Check the Succinct Explorer for detailed metrics and verification info.");
    } else {
        println!("✅ EVM-compatible proof generated successfully locally!");
    }

    create_proof_fixture(
        &proof,
        pk.verifying_key(),
        args.system,
        args.output_path.as_deref(),
    )?;

    Ok(())
}

/// Create a fixture for the given proof.
fn create_proof_fixture(
    proof: &sp1_sdk::SP1ProofWithPublicValues,
    vk: &sp1_sdk::SP1VerifyingKey,
    system: ProofSystem,
    output_path: Option<&std::path::Path>,
) -> Result<()> {
    let fixture = fixture_from_proof(proof, vk)?;
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
    println!(
        "Proof Bytes Length: {} bytes",
        hex::decode(&fixture.proof[2..]).unwrap().len()
    );

    // Save the fixture to a file.
    let fixture_file_path = output_path
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| default_fixture_output_path(&format!("{:?}", system).to_lowercase()));
    std::fs::create_dir_all(
        fixture_file_path
            .parent()
            .expect("fixture path should have a parent"),
    )
    .expect("failed to create fixture path");
    write_fixture_file(&fixture, &fixture_file_path)?;

    println!("\n✅ Fixture saved to: {:?}", fixture_file_path);
    println!("This fixture can be used for on-chain verification testing.");

    Ok(())
}
