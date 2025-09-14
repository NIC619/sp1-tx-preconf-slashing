# Proof Fixtures Directory

This directory contains different types of proof fixtures for various purposes in the transaction inclusion system.

## Fixture Types

### 🔄 Dynamic Fixtures (Updated by Proof Generation)
These fixtures are automatically updated when new proofs are generated and should be used for **real-time proof generation** and **production workflows**:

- **`groth16-fixture.json`** - Latest Groth16 proof from Succinct prover network
- **`plonk-fixture.json`** - Latest PLONK proof (when available)

**Used by:**
- Backend service (`contracts/demo/backend/server.js`) for fallback scenarios
- Rust proof generation scripts (`script/src/bin/evm_prover_network.rs`, `script/src/bin/evm.rs`)
- Demo UI for real-time proof scenarios

### 🧪 Stable Test Fixtures (Never Change)
These fixtures contain **fixed values** that never change and should be used for **tests** and **local simulations**:

- **`groth16-fixture-for-tests.json`** - Stable Groth16 proof for consistent testing
- **`plonk-fixture-for-tests.json`** - Stable PLONK proof for consistent testing

**Used by:**
- Solidity tests (`contracts/test/TransactionInclusionVerifier.t.sol`)
- Onchain verification script (`contracts/script/VerifyProofOnchain.s.sol`) 
- Fixture repair utility (`script/src/bin/fix_fixture.rs`)
- Demo UI hardcoded `PROOF_FIXTURE` constant for reliable demo scenarios

## Why This Separation?

### Problem Before
- Tests would break whenever new proofs were generated
- Documentation had to be updated with new values constantly
- Inconsistent behavior between test runs
- Hard to maintain stable demo scenarios

### Solution Now
- **Tests use stable fixtures** → Consistent, reliable test results
- **Real-time systems use dynamic fixtures** → Always have latest proof data
- **Demo UI uses hardcoded values** → Predictable demo experience
- **Documentation references stable values** → No more constant updates

## Usage Guidelines

### For New Tests or Local Simulations
✅ **DO:** Use `*-for-tests.json` fixtures
```solidity
string memory path = string.concat(root, "/src/fixtures/groth16-fixture-for-tests.json");
```

❌ **DON'T:** Use dynamic fixtures in tests
```solidity
// This will break when new proofs are generated
string memory path = string.concat(root, "/src/fixtures/groth16-fixture.json");
```

### For Production/Real-time Systems
✅ **DO:** Use dynamic fixtures that get updated
```javascript
const fixturePath = path.join(__dirname, '../fixtures', `${proofSystem}-fixture.json`);
```

### For Demo UI
✅ **DO:** Use hardcoded stable constants
```javascript
export const PROOF_FIXTURE = {
  "blockNumber": 23354683,
  "transactionIndex": 87,
  // ... stable values that never change
};
```

## Fixture Values

All test fixtures are currently based on:
- **Block Number:** 23354683
- **Transaction Index:** 87
- **Block Hash:** 0xc936613ff8e7fb04ed39ef9e25417f779b187d449b04c7ade75917ff33166021
- **Transaction Hash:** 0xd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f9436

These values provide a consistent foundation for all testing scenarios.