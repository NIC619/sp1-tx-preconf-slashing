// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TransactionInclusionVerifier, PublicValuesStruct} from "./TransactionInclusionVerifier.sol";

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

    event BondAdded(address indexed proposer, uint256 amount, uint256 newTotal);
    event WithdrawalInitiated(address indexed proposer, uint256 amount, uint256 availableAt);
    event WithdrawalCompleted(address indexed proposer, uint256 amount);
    event ProposerSlashed(
        address indexed proposer, 
        bytes32 indexed commitmentHash,
        uint256 slashedAmount,
        address indexed slasher
    );

    error InsufficientBondAmount();
    error InsufficientProposerBond();
    error NoWithdrawalInitiated();
    error WithdrawalDelayNotMet();
    error InvalidSignature();
    error CommitmentExpired();
    error CommitmentAlreadySlashed();
    error TransactionWasIncluded();

    constructor(address _inclusionVerifier, uint256 _withdrawalDelay) {
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

        (
            ,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
        ) = TransactionInclusionVerifier(INCLUSION_VERIFIER).verifyTransactionInclusionView(
            publicValues, 
            proofBytes
        );

        if (blockNumber != commitment.blockNumber) {
            revert("Block number mismatch");
        }

        if (isIncluded && transactionHash == commitment.transactionHash && transactionIndex == commitment.transactionIndex) {
            revert TransactionWasIncluded();
        }

        slashedCommitments[commitmentHash] = true;
        proposerBonds[proposer] -= SLASH_AMOUNT;

        (bool success,) = BURN_ADDRESS.call{value: SLASH_AMOUNT}("");
        require(success, "Burn failed");

        emit ProposerSlashed(proposer, commitmentHash, SLASH_AMOUNT, msg.sender);
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

    function _verifySignature(
        InclusionCommitment calldata commitment,
        address proposer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view returns (bool) {
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