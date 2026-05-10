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
use alloy::primitives::Bytes;
use alloy::providers::{Provider, RootProvider};
use alloy_rpc_types::BlockId;
use clap::{Parser, ValueEnum};
use eyre::Result;
use sp1_sdk::{include_elf, Elf, ProveRequest, Prover, ProverClient, ProvingKey, SP1Stdin};
use tx_inclusion_precise_index::{
    default_fixture_output_path, fixture_from_proof, load_repo_dotenv,
    select_first_transaction_from_recent_finalized_block, write_fixture_file,
    RECENT_FINALIZED_OFFSET,
};
use tx_inclusion_precise_index_lib::{
    encode_transaction_for_trie, generate_merkle_absence_proof, generate_merkle_proof,
    generate_sender_account_witness, TransactionInclusionInput,
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
        help = "Transaction hash to prove; omitted means first transaction from finalized - 2"
    )]
    transaction_hash: Option<String>,
    #[arg(
        long,
        help = "Committed transaction hash when proving that a different transaction was included at the promised index"
    )]
    committed_transaction_hash: Option<String>,
    #[arg(
        long,
        help = "Block number for a no-transaction-at-index absence proof"
    )]
    absence_block_number: Option<u64>,
    #[arg(
        long,
        help = "Transaction index for a no-transaction-at-index absence proof"
    )]
    absence_transaction_index: Option<u64>,
    #[arg(
        long,
        help = "Generate an absence proof for the first index past the selected block's transaction count"
    )]
    absence_past_end: bool,
}

/// Enum representing the available proof systems
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum ProofSystem {
    Plonk,
    Groth16,
}

#[tokio::main]
async fn main() -> Result<()> {
    load_repo_dotenv();
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

    let input = if args.absence_block_number.is_some()
        || args.absence_transaction_index.is_some()
        || args.absence_past_end
    {
        let recent_selection = if args.absence_past_end
            && args.absence_block_number.is_none()
            && args.absence_transaction_index.is_none()
        {
            Some(select_first_transaction_from_recent_finalized_block(&provider).await?)
        } else {
            None
        };

        let block_number = args
            .absence_block_number
            .or_else(|| {
                recent_selection
                    .as_ref()
                    .map(|selection| selection.block_number)
            })
            .ok_or_else(|| eyre::eyre!("--absence-block-number is required for absence proofs"))?;
        let tx_index = args
            .absence_transaction_index
            .or_else(|| {
                recent_selection
                    .as_ref()
                    .map(|selection| selection.transaction_count as u64)
            })
            .ok_or_else(|| {
                eyre::eyre!("--absence-transaction-index is required for absence proofs")
            })?;

        println!(
            "Generating no-transaction-at-index proof for block {}, index {}",
            block_number, tx_index
        );
        if let Some(selection) = &recent_selection {
            println!(
                "Selected absence target from block {} (finalized block {} - {}, {} transactions)",
                selection.block_number,
                selection.finalized_block_number,
                RECENT_FINALIZED_OFFSET,
                selection.transaction_count
            );
        }

        let block = provider
            .get_block(BlockId::Number(block_number.into()))
            .await?
            .ok_or_else(|| eyre::eyre!("Block not found"))?;

        let merkle_proof = generate_merkle_absence_proof(&provider, block_number, tx_index).await?;
        let committed_hash = args
            .committed_transaction_hash
            .clone()
            .or_else(|| args.transaction_hash.clone());
        let committed_raw_transaction = if let Some(transaction_hash) = committed_hash {
            let committed_tx = provider
                .get_transaction_by_hash(transaction_hash.parse()?)
                .await?
                .ok_or_else(|| eyre::eyre!("Committed transaction not found"))?;
            encode_transaction_for_trie(&committed_tx)?
        } else {
            let (_committed_merkle_proof, encoded_tx_bytes) =
                generate_merkle_proof(&provider, block_number, 0).await?;
            encoded_tx_bytes
        };
        let sender_witness =
            generate_sender_account_witness(&provider, block_number, &committed_raw_transaction)
                .await?;

        TransactionInclusionInput {
            block_header: block.header.clone().into(),
            parent_block_header: sender_witness.parent_block_header,
            committed_raw_transaction,
            sender_account: sender_witness.account,
            sender_account_proof: sender_witness.proof,
            raw_transaction: Bytes::new(),
            transaction_index: tx_index,
            merkle_proof,
            prove_absence: true,
        }
    } else {
        let (block_number, tx_index) = if let Some(transaction_hash) = args.transaction_hash.clone()
        {
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
                .ok_or_else(|| eyre::eyre!("Transaction index not found"))?
                as u64;

            println!(
                "Transaction found in block: {}, index: {}",
                block_number, tx_index
            );
            (block_number, tx_index)
        } else {
            let selection = select_first_transaction_from_recent_finalized_block(&provider).await?;
            println!(
                "Selected first transaction from block {} (finalized block {} - {}, {} transactions)",
                selection.block_number,
                selection.finalized_block_number,
                RECENT_FINALIZED_OFFSET,
                selection.transaction_count
            );
            (selection.block_number, selection.transaction_index)
        };

        // Get the block with all transactions
        let block = provider
            .get_block(BlockId::Number(block_number.into()))
            .await?
            .ok_or_else(|| eyre::eyre!("Block not found"))?;

        // Generate Merkle proof
        let (merkle_proof, encoded_tx_bytes) =
            generate_merkle_proof(&provider, block_number, tx_index).await?;
        let committed_raw_transaction =
            if let Some(committed_transaction_hash) = args.committed_transaction_hash {
                let committed_tx = provider
                    .get_transaction_by_hash(committed_transaction_hash.parse()?)
                    .await?
                    .ok_or_else(|| eyre::eyre!("Committed transaction not found"))?;
                encode_transaction_for_trie(&committed_tx)?
            } else {
                encoded_tx_bytes.clone()
            };
        let sender_witness =
            generate_sender_account_witness(&provider, block_number, &committed_raw_transaction)
                .await?;

        TransactionInclusionInput {
            block_header: block.header.clone().into(),
            parent_block_header: sender_witness.parent_block_header,
            committed_raw_transaction,
            sender_account: sender_witness.account,
            sender_account_proof: sender_witness.proof,
            raw_transaction: encoded_tx_bytes,
            transaction_index: tx_index,
            merkle_proof,
            prove_absence: false,
        }
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
    println!(
        "Committed Transaction Hash: {}",
        fixture.committed_transaction_hash
    );
    println!("Transaction Hash: {}", fixture.transaction_hash);
    println!("Transaction Index: {}", fixture.transaction_index);
    println!("Is Included: {}", fixture.is_included);
    println!(
        "Transaction Can Be Included: {}",
        fixture.transaction_can_be_included
    );
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
