use eyre::Result;
use serde::{Deserialize, Serialize};
use sp1_sdk::{HashableKey, SP1ProofWithPublicValues, SP1VerifyingKey};
use std::path::{Path, PathBuf};

use alloy::eips::BlockNumberOrTag;
use alloy::providers::Provider;
use alloy_rpc_types::{BlockId, BlockTransactions};
use alloy_sol_types::SolType;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SP1TransactionInclusionProofFixture {
    pub block_hash: String,
    pub block_number: u64,
    pub committed_transaction_hash: String,
    pub transaction_hash: String,
    pub transaction_index: u64,
    pub is_included: bool,
    pub transaction_can_be_included: bool,
    pub verified_against_root: String,
    pub vkey: String,
    pub public_values: String,
    pub proof: String,
}

pub fn decode_public_values(bytes: &[u8]) -> Result<PublicValuesStruct> {
    Ok(PublicValuesStruct::abi_decode(bytes)?)
}

pub fn fixture_from_proof(
    proof: &SP1ProofWithPublicValues,
    vk: &SP1VerifyingKey,
) -> Result<SP1TransactionInclusionProofFixture> {
    let bytes = proof.public_values.as_slice();
    let decoded = decode_public_values(bytes)?;

    Ok(SP1TransactionInclusionProofFixture {
        block_hash: format!("0x{}", hex::encode(decoded.blockHash.as_slice())),
        block_number: decoded.blockNumber,
        committed_transaction_hash: format!(
            "0x{}",
            hex::encode(decoded.committedTransactionHash.as_slice())
        ),
        transaction_hash: format!("0x{}", hex::encode(decoded.transactionHash.as_slice())),
        transaction_index: decoded.transactionIndex,
        is_included: decoded.isIncluded,
        transaction_can_be_included: decoded.transactionCanBeIncluded,
        verified_against_root: format!("0x{}", hex::encode(decoded.verifiedAgainstRoot.as_slice())),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    })
}

pub fn write_fixture_file(
    fixture: &SP1TransactionInclusionProofFixture,
    path: impl AsRef<Path>,
) -> Result<()> {
    std::fs::write(path, serde_json::to_string_pretty(fixture)?)?;
    Ok(())
}

pub fn default_fixture_output_path(system_name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../contracts/src/fixtures")
        .join(format!("{system_name}-fixture.json"))
}

pub fn load_repo_dotenv() {
    dotenv::from_path(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env")).ok();
    dotenv::dotenv().ok();
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentFirstTransaction {
    pub finalized_block_number: u64,
    pub block_number: u64,
    pub transaction_index: u64,
    pub transaction_count: usize,
}

pub const RECENT_FINALIZED_OFFSET: u64 = 2;

pub async fn select_first_transaction_from_recent_finalized_block(
    provider: &impl Provider,
) -> Result<RecentFirstTransaction> {
    let finalized_block = provider
        .get_block(BlockId::Number(BlockNumberOrTag::Finalized))
        .await?
        .ok_or_else(|| eyre::eyre!("Finalized block not found"))?;
    let finalized_block_number = finalized_block.header.number;
    let block_number = finalized_block_number
        .checked_sub(RECENT_FINALIZED_OFFSET)
        .ok_or_else(|| {
            eyre::eyre!(
                "Finalized block {} is below requested offset {}",
                finalized_block_number,
                RECENT_FINALIZED_OFFSET
            )
        })?;

    let block = provider
        .get_block(BlockId::Number(block_number.into()))
        .full()
        .await?
        .ok_or_else(|| eyre::eyre!("Block not found: {}", block_number))?;

    let transaction_count = match &block.transactions {
        BlockTransactions::Full(txs) => txs.len(),
        BlockTransactions::Hashes(txs) => txs.len(),
        _ => return Err(eyre::eyre!("Unexpected transaction format")),
    };

    if transaction_count == 0 {
        return Err(eyre::eyre!(
            "Selected block {} has no transactions; cannot use first transaction",
            block_number
        ));
    }

    Ok(RecentFirstTransaction {
        finalized_block_number,
        block_number,
        transaction_index: 0,
        transaction_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_fixture(name: &str) -> SP1TransactionInclusionProofFixture {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../contracts/src/fixtures")
            .join(name);
        let json = std::fs::read_to_string(path).expect("fixture should be readable");
        serde_json::from_str(&json).expect("fixture json should decode")
    }

    fn decode_fixture_public_values(
        fixture: &SP1TransactionInclusionProofFixture,
    ) -> PublicValuesStruct {
        let bytes = hex::decode(fixture.public_values.trim_start_matches("0x"))
            .expect("public values should be valid hex");
        decode_public_values(&bytes).expect("public values should decode")
    }

    #[test]
    fn groth16_fixture_public_values_match_top_level_fields() {
        let fixture = load_fixture("groth16-fixture-for-tests.json");
        let decoded = decode_fixture_public_values(&fixture);

        assert_eq!(
            fixture.block_hash,
            format!("0x{}", hex::encode(decoded.blockHash.as_slice()))
        );
        assert_eq!(fixture.block_number, decoded.blockNumber);
        assert_eq!(
            fixture.committed_transaction_hash,
            format!(
                "0x{}",
                hex::encode(decoded.committedTransactionHash.as_slice())
            )
        );
        assert_eq!(
            fixture.transaction_hash,
            format!("0x{}", hex::encode(decoded.transactionHash.as_slice()))
        );
        assert_eq!(fixture.transaction_index, decoded.transactionIndex);
        assert_eq!(fixture.is_included, decoded.isIncluded);
        assert_eq!(
            fixture.transaction_can_be_included,
            decoded.transactionCanBeIncluded
        );
        assert_eq!(
            fixture.verified_against_root,
            format!("0x{}", hex::encode(decoded.verifiedAgainstRoot.as_slice()))
        );
    }
}
