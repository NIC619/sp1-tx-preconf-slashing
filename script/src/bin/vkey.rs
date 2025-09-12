use sp1_sdk::{include_elf, HashableKey, Prover, ProverClient};

/// The ELF (executable and linkable format) file for the Succinct RISC-V zkVM.
const ELF: &[u8] = include_elf!("tx-inclusion-precise-index-client");

fn main() {
    let prover = ProverClient::builder().cpu().build();
    let (_, vk) = prover.setup(ELF);
    println!("{}", vk.bytes32());
}
