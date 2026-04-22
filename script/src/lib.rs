use eyre::Result;
use serde::{Deserialize, Serialize};
use sp1_sdk::{HashableKey, SP1ProofWithPublicValues, SP1VerifyingKey};
use std::path::{Path, PathBuf};

use alloy_sol_types::SolType;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SP1TransactionInclusionProofFixture {
    pub block_hash: String,
    pub block_number: u64,
    pub transaction_hash: String,
    pub transaction_index: u64,
    pub is_included: bool,
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
        transaction_hash: format!("0x{}", hex::encode(decoded.transactionHash.as_slice())),
        transaction_index: decoded.transactionIndex,
        is_included: decoded.isIncluded,
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
            fixture.transaction_hash,
            format!("0x{}", hex::encode(decoded.transactionHash.as_slice()))
        );
        assert_eq!(fixture.transaction_index, decoded.transactionIndex);
        assert_eq!(fixture.is_included, decoded.isIncluded);
        assert_eq!(
            fixture.verified_against_root,
            format!("0x{}", hex::encode(decoded.verifiedAgainstRoot.as_slice()))
        );
    }

    #[test]
    fn plonk_fixture_public_values_match_top_level_fields() {
        let fixture = load_fixture("plonk-fixture-for-tests.json");
        let decoded = decode_fixture_public_values(&fixture);

        assert_eq!(
            fixture.block_hash,
            format!("0x{}", hex::encode(decoded.blockHash.as_slice()))
        );
        assert_eq!(fixture.block_number, decoded.blockNumber);
        assert_eq!(
            fixture.transaction_hash,
            format!("0x{}", hex::encode(decoded.transactionHash.as_slice()))
        );
        assert_eq!(fixture.transaction_index, decoded.transactionIndex);
        assert_eq!(fixture.is_included, decoded.isIncluded);
        assert_eq!(
            fixture.verified_against_root,
            format!("0x{}", hex::encode(decoded.verifiedAgainstRoot.as_slice()))
        );
    }

    #[test]
    fn fixture_public_values_are_same_across_proof_systems() {
        let groth16 = load_fixture("groth16-fixture-for-tests.json");
        let plonk = load_fixture("plonk-fixture-for-tests.json");

        assert_eq!(groth16.public_values, plonk.public_values);
        assert_eq!(groth16.block_hash, plonk.block_hash);
        assert_eq!(groth16.block_number, plonk.block_number);
        assert_eq!(groth16.transaction_hash, plonk.transaction_hash);
        assert_eq!(groth16.transaction_index, plonk.transaction_index);
        assert_eq!(groth16.is_included, plonk.is_included);
        assert_eq!(groth16.verified_against_root, plonk.verified_against_root);
        assert_ne!(groth16.vkey, plonk.vkey);
        assert_ne!(groth16.proof, plonk.proof);
    }
}
