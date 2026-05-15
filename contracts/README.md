# Contracts

This directory contains the Solidity contracts, Foundry tests, deployment scripts, and the demo UI.

## Contracts

- `src/TransactionInclusionVerifier.sol`: verifies SP1 transaction-inclusion proofs and decodes public values.
- `src/TxInclusionPreciseSlasher.sol`: manages proposer bonds, verifies exact-position EIP-712 commitments, registers canonical block metadata, and slashes supported violations.

`TxInclusionPreciseSlasher` accepts two proof shapes:

- a different transaction is included at the promised index
- no transaction exists at the promised index

It does not slash whole-block omission, missed proposer duty, or proposer identity failures.

## Environment

Copy the example and fill in deployment values:

```sh
cp .env.example .env
```

Required for deployment:

```env
DEPLOYER_PRIVATE_KEY=0x...
OWNER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
# Sepolia Groth16 verifier gateway; routes v6.1.x proofs with sp1-contracts v6.1.1.
SP1_VERIFIER_ADDRESS=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B
TX_INCLUSION_PROGRAM_VKEY=0x00ef99aa9ca5343648ec4bf880180e8f9a05d8be759659925cec813035acf507
```

`DEPLOYER_PRIVATE_KEY` pays deployment gas. `OWNER_PRIVATE_KEY` determines the owner address passed to the verifier and slasher constructors.

## Test

```sh
forge build
forge test
```

Useful focused runs:

```sh
forge test --match-contract TxInclusionPreciseSlasherTest
forge test --match-contract TransactionInclusionGroth16Test
```

PLONK proofs are not supported by this repo. Use Groth16 fixtures and the Groth16 verifier gateway.

## Deploy

Deploy the verifier first, then the slasher:

```sh
./deploy-and-verify.sh verifier sepolia
./deploy-and-verify.sh slasher sepolia
```

The script:

- reads `.env`
- reads/writes `deployment.env`
- verifies on Etherscan
- updates `demo/src/contracts.js`
- updates `demo/README.md`

Manual script commands are also supported:

```sh
forge script script/DeployTransactionInclusionVerifier.s.sol:DeployTransactionInclusionVerifier \
  --rpc-url sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"

forge script script/DeployTxInclusionPreciseSlasher.s.sol:DeployTxInclusionPreciseSlasher \
  --rpc-url sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

## Canonical Block Registration

Before a slash succeeds, the slasher owner must register the canonical block hash and timestamp for the committed block. In the demo UI flow, the backend does this automatically with `OWNER_PRIVATE_KEY`.

For manual testing:

```sh
BLOCK_NUMBER=123 \
BLOCK_HASH=0x... \
BLOCK_TIMESTAMP=1234567890 \
forge script script/RegisterCanonicalBlock.s.sol:RegisterCanonicalBlock \
  --rpc-url sepolia \
  --broadcast
```

## Deployment Output

`deployment.env` contains the latest contract metadata:

```env
TRANSACTION_INCLUSION_VERIFIER=0x...
OWNER=0x...
SP1_VERIFIER=0x...
PROGRAM_VKEY=0x...

TX_INCLUSION_PRECISE_SLASHER=0x...
SLASHER_OWNER=0x...
WITHDRAWAL_DELAY=100
SLASH_AMOUNT=100000000000000000
MIN_BOND_AMOUNT=100000000000000000
```

## More Detail

See [DEPLOYMENT.md](./DEPLOYMENT.md) for a longer deployment guide and troubleshooting notes.
