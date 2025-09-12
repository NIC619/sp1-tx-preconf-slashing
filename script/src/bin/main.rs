use alloy::network::Ethereum;
use alloy::providers::{Provider, RootProvider};
use alloy_rpc_types::BlockId;
use clap::Parser;
use eyre::Result;
use sp1_sdk::{include_elf, utils, ProverClient, SP1Stdin};
use tx_inclusion_precise_index_lib::{
    generate_merkle_proof, TransactionInclusionInput, INCLUDED_TX,
};

// Import alloy-sol-types for ABI encoding
use alloy_sol_types::SolType;

// Define the Solidity-compatible struct for ABI decoding
alloy_sol_types::sol! {
    struct PublicValuesStruct {
        bytes32 blockHash;
        uint64 blockNumber;
        bytes32 transactionHash;
        uint64 transactionIndex;
        bool isIncluded;
        bytes32 verifiedAgainstRoot;
    }
}
use url::Url;

const ELF: &[u8] = include_elf!("tx-inclusion-precise-index-client");

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    #[clap(long, conflicts_with = "execute")]
    prove: bool,

    #[clap(long, default_value = "https://ethereum-rpc.publicnode.com")]
    eth_rpc_url: Url,

    #[clap(long, conflicts_with = "prove")]
    execute: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    utils::setup_logger();

    let args = Args::parse();
    let provider = RootProvider::<Ethereum>::new_http(args.eth_rpc_url.clone());

    println!("Running transaction inclusion at precise index proof test");

    // Error handling if neither option is selected
    if !args.execute && !args.prove {
        eprintln!("Error: You must specify either --execute or --prove");
        std::process::exit(1);
    }

    println!("=== Testing transaction inclusion at precise index ===");

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

    // Generate Merkle proof which includes the actual encoded transaction
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

    let client = ProverClient::from_env();

    if args.execute {
        // Execution branch
        println!("Executing SP1 program...");
        let (output, report) = client
            .execute(ELF, &stdin)
            .run()
            .map_err(|e| eyre::eyre!("Execution failed: {}", e))?;
        println!(
            "Program executed with {} cycles",
            report.total_instruction_count()
        );

        // Decode the ABI-encoded output
        let decoded = PublicValuesStruct::abi_decode(output.as_slice(), true)?;

        println!("\n=== EXECUTION RESULT ===");
        println!("Block Hash: 0x{}", hex::encode(decoded.blockHash.as_slice()));
        println!("Block Number: {}", decoded.blockNumber);
        println!("Transaction Hash: 0x{}", hex::encode(decoded.transactionHash.as_slice()));
        println!("Transaction Index: {}", decoded.transactionIndex);
        println!("Is Included: {}", decoded.isIncluded);
        println!(
            "Verified Against Root: 0x{}",
            hex::encode(decoded.verifiedAgainstRoot.as_slice())
        );

        // Verify the result
        if decoded.isIncluded {
            println!("✅ SUCCESS: Transaction correctly proved as INCLUDED");
        } else {
            println!("❌ FAILURE: Transaction should be included but was marked as excluded");
        }
    } else {
        // Proof generation branch
        println!("\nGenerating ZK proof...");
        let (pk, vk) = client.setup(ELF);
        let proof = client
            .prove(&pk, &stdin)
            .run()
            .map_err(|e| eyre::eyre!("Proof generation failed: {}", e))?;
        println!("✅ Proof generated successfully!");

        client.verify(&proof, &vk)?;
        println!("✅ Proof verified successfully!");
    }

    Ok(())
}


