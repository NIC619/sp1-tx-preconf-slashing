use sp1_sdk::{include_elf, Elf, HashableKey, Prover, ProverClient, ProvingKey};

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
const ELF: Elf = include_elf!("tx-inclusion-precise-index-client");

#[tokio::main]
async fn main() {
    let prover = ProverClient::builder().cpu().build().await;
    let pk = prover
        .setup(ELF)
        .await
        .expect("failed to derive proving key");
    println!("{}", pk.verifying_key().bytes32());
}
