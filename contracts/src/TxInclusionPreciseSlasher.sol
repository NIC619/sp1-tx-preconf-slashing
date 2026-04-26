// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITransactionInclusionVerifier, PublicValuesStruct} from "./TransactionInclusionVerifier.sol";

struct InclusionCommitment {
    uint64 blockNumber;
    bytes32 transactionHash;
    uint64 transactionIndex;
    uint256 deadline;
}

contract TxInclusionPreciseSlasher {
    uint256 public constant SLASH_AMOUNT = 0.1 ether;
    uint256 public constant MIN_BOND_AMOUNT = 0.1 ether;
    address public constant BURN_ADDRESS = address(0);

    address public immutable OWNER;
    uint256 public immutable WITHDRAWAL_DELAY;
    address public immutable INCLUSION_VERIFIER;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant COMMITMENT_TYPEHASH = keccak256(
        "InclusionCommitment(uint64 blockNumber,bytes32 transactionHash,uint64 transactionIndex,uint256 deadline)"
    );

    mapping(address => uint256) public proposerBonds;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => uint256) public withdrawalTimestamps;
    mapping(bytes32 => bool) public slashedCommitments;
    mapping(uint64 => bytes32) public canonicalBlockHashes;

    event BondAdded(address indexed proposer, uint256 amount, uint256 newTotal);
    event WithdrawalInitiated(address indexed proposer, uint256 amount, uint256 availableAt);
    event WithdrawalCompleted(address indexed proposer, uint256 amount);
    event CanonicalBlockHashRegistered(uint64 indexed blockNumber, bytes32 indexed blockHash);
    event ProposerSlashed(
        address indexed proposer, bytes32 indexed commitmentHash, uint256 slashedAmount, address indexed slasher
    );

    error InsufficientBondAmount();
    error InsufficientProposerBond();
    error NoWithdrawalInitiated();
    error WithdrawalDelayNotMet();
    error InvalidSignature();
    error CommitmentExpired();
    error CommitmentAlreadySlashed();
    error TransactionWasIncluded();
    error BlockNumberMismatch();
    error MissingCanonicalBlockHash();
    error BlockHashMismatch();
    error InvalidCanonicalBlockHash();
    error OnlyOwner();
    error InvalidIncludedTransactionProof();
    error InvalidNoTransactionProof();
    error TransactionIndexMismatch();

    constructor(address _inclusionVerifier, uint256 _withdrawalDelay) {
        OWNER = msg.sender;
        INCLUSION_VERIFIER = _inclusionVerifier;
        WITHDRAWAL_DELAY = _withdrawalDelay;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("TxInclusionPreciseSlasher"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function addBond() external payable {
        if (msg.value < MIN_BOND_AMOUNT) {
            revert InsufficientBondAmount();
        }

        proposerBonds[msg.sender] += msg.value;
        emit BondAdded(msg.sender, msg.value, proposerBonds[msg.sender]);
    }

    /// @notice Registers the canonical execution block hash used to evaluate commitments for a block number.
    /// @dev This is a demo-grade trusted anchor controlled by the contract owner. A production version should replace
    /// this owner registration with an on-chain canonicality mechanism appropriate for the target chain and time horizon.
    /// @param blockNumber The execution block number being anchored.
    /// @param blockHash The canonical execution block hash for `blockNumber`.
    function registerCanonicalBlockHash(uint64 blockNumber, bytes32 blockHash) external {
        if (msg.sender != OWNER) {
            revert OnlyOwner();
        }
        if (blockHash == bytes32(0)) {
            revert InvalidCanonicalBlockHash();
        }

        canonicalBlockHashes[blockNumber] = blockHash;
        emit CanonicalBlockHashRegistered(blockNumber, blockHash);
    }

    function initiateWithdrawal(uint256 amount) external {
        if (proposerBonds[msg.sender] < amount) {
            revert InsufficientProposerBond();
        }

        pendingWithdrawals[msg.sender] = amount;
        withdrawalTimestamps[msg.sender] = block.timestamp + WITHDRAWAL_DELAY;

        emit WithdrawalInitiated(msg.sender, amount, withdrawalTimestamps[msg.sender]);
    }

    function completeWithdrawal() external {
        uint256 withdrawalTime = withdrawalTimestamps[msg.sender];
        if (withdrawalTime == 0) {
            revert NoWithdrawalInitiated();
        }
        if (block.timestamp < withdrawalTime) {
            revert WithdrawalDelayNotMet();
        }

        uint256 amount = pendingWithdrawals[msg.sender];
        if (proposerBonds[msg.sender] < amount) {
            revert InsufficientProposerBond();
        }

        proposerBonds[msg.sender] -= amount;
        pendingWithdrawals[msg.sender] = 0;
        withdrawalTimestamps[msg.sender] = 0;

        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit WithdrawalCompleted(msg.sender, amount);
    }

    /// @notice Slashes a proposer for violating an exact-position transaction inclusion commitment.
    /// @dev The signed commitment means:
    /// `txHashAt(commitment.blockNumber, commitment.transactionIndex) == commitment.transactionHash`.
    ///
    /// A successful proof must be anchored to the owner-registered canonical block hash for the committed block number.
    /// Once anchored, two proof shapes are accepted:
    ///
    /// 1. Different transaction at index:
    ///    - `proofOutput.isIncluded == true`
    ///    - `proofOutput.transactionHash != bytes32(0)`
    ///    - `proofOutput.transactionHash != commitment.transactionHash`
    ///    - `proofOutput.transactionIndex == commitment.transactionIndex`
    ///
    /// 2. No transaction at index:
    ///    - `proofOutput.isIncluded == false`
    ///    - `proofOutput.transactionHash == bytes32(0)`
    ///    - `proofOutput.transactionIndex == commitment.transactionIndex`
    ///
    /// For the second case, `transactionIndex` is not the index of an included transaction. It is the transaction-trie
    /// key that the SP1 proof proves absent. This single absence case covers an empty block, an index outside the
    /// block's transaction range, or any other canonical transaction trie with no value at the promised index.
    ///
    /// This function does not prove that the signer was the canonical proposer for the block, did or did not miss a
    /// slot, or omitted the transaction from every position in the block. Those are separate commitment/evidence
    /// models outside the current exact-position demo semantics.
    /// @param commitment The EIP-712 commitment signed by `proposer`.
    /// @param proposer The address whose bond is slashable and whose signature must recover from the commitment digest.
    /// @param v ECDSA signature recovery id.
    /// @param r ECDSA signature r value.
    /// @param s ECDSA signature s value.
    /// @param publicValues ABI-encoded public values committed by the SP1 proof.
    /// @param proofBytes The SP1 proof bytes verified by `INCLUSION_VERIFIER`.
    function slash(
        InclusionCommitment calldata commitment,
        address proposer,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external {
        if (block.timestamp > commitment.deadline) {
            revert CommitmentExpired();
        }

        bytes32 commitmentHash = _hashCommitment(commitment);
        if (slashedCommitments[commitmentHash]) {
            revert CommitmentAlreadySlashed();
        }

        if (!_verifySignature(commitment, proposer, v, r, s)) {
            revert InvalidSignature();
        }

        if (proposerBonds[proposer] < SLASH_AMOUNT) {
            revert InsufficientProposerBond();
        }

        PublicValuesStruct memory proofOutput =
            ITransactionInclusionVerifier(INCLUSION_VERIFIER).verifyTransactionInclusionView(publicValues, proofBytes);

        if (proofOutput.blockNumber != commitment.blockNumber) {
            revert BlockNumberMismatch();
        }

        // Demo canonicality anchor: the proof's block hash must match the trusted hash registered for this block.
        bytes32 canonicalBlockHash = canonicalBlockHashes[commitment.blockNumber];
        if (canonicalBlockHash == bytes32(0)) {
            revert MissingCanonicalBlockHash();
        }
        if (proofOutput.blockHash != canonicalBlockHash) {
            revert BlockHashMismatch();
        }

        if (proofOutput.isIncluded) {
            if (proofOutput.transactionHash == bytes32(0)) {
                revert InvalidIncludedTransactionProof();
            }
            // Inclusion proofs are slashable only when the proved transaction at the promised index is different.
            if (proofOutput.transactionHash == commitment.transactionHash) {
                revert TransactionWasIncluded();
            }
        } else {
            // Absence proofs use the zero hash sentinel to distinguish "no transaction at this index" from inclusion.
            if (proofOutput.transactionHash != bytes32(0)) {
                revert InvalidNoTransactionProof();
            }
        }

        // In inclusion mode this is the included transaction's index. In absence mode this is the empty trie key.
        if (proofOutput.transactionIndex != commitment.transactionIndex) {
            revert TransactionIndexMismatch();
        }

        slashedCommitments[commitmentHash] = true;
        proposerBonds[proposer] -= SLASH_AMOUNT;

        (bool success,) = BURN_ADDRESS.call{value: SLASH_AMOUNT}("");
        require(success, "Burn failed");

        emit ProposerSlashed(proposer, commitmentHash, SLASH_AMOUNT, msg.sender);
    }

    function hashCommitment(InclusionCommitment calldata commitment) external view returns (bytes32) {
        return _hashCommitment(commitment);
    }

    function _hashCommitment(InclusionCommitment calldata commitment) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        COMMITMENT_TYPEHASH,
                        commitment.blockNumber,
                        commitment.transactionHash,
                        commitment.transactionIndex,
                        commitment.deadline
                    )
                )
            )
        );
    }

    function _verifySignature(InclusionCommitment calldata commitment, address proposer, uint8 v, bytes32 r, bytes32 s)
        internal
        view
        returns (bool)
    {
        bytes32 digest = _hashCommitment(commitment);
        address recoveredSigner = ecrecover(digest, v, r, s);
        return recoveredSigner == proposer;
    }

    function getProposerBond(address proposer) external view returns (uint256) {
        return proposerBonds[proposer];
    }

    function getPendingWithdrawal(address proposer) external view returns (uint256) {
        return pendingWithdrawals[proposer];
    }

    function getWithdrawalTimestamp(address proposer) external view returns (uint256) {
        return withdrawalTimestamps[proposer];
    }

    function isCommitmentSlashed(bytes32 commitmentHash) external view returns (bool) {
        return slashedCommitments[commitmentHash];
    }
}
