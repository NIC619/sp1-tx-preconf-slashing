// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TxInclusionPreciseSlasher, InclusionCommitment} from "../src/TxInclusionPreciseSlasher.sol";
import {ITransactionInclusionVerifier, PublicValuesStruct} from "../src/TransactionInclusionVerifier.sol";

contract MockTransactionInclusionVerifier is ITransactionInclusionVerifier {
    PublicValuesStruct internal mockReturn = PublicValuesStruct({
        blockHash: bytes32(uint256(1)),
        blockNumber: uint64(100),
        transactionHash: bytes32(uint256(2)),
        transactionIndex: uint64(1),
        isIncluded: false,
        verifiedAgainstRoot: bytes32(uint256(3))
    });

    function setMockReturn(PublicValuesStruct memory _mockReturn) external {
        mockReturn = _mockReturn;
    }

    function verifyTransactionInclusionView(bytes calldata, bytes calldata)
        external
        view
        returns (PublicValuesStruct memory)
    {
        return mockReturn;
    }
}

contract TxInclusionPreciseSlasherTest is Test {
    TxInclusionPreciseSlasher public slasher;
    MockTransactionInclusionVerifier public mockVerifier;

    uint256 internal proposerPrivateKey = 0x1;
    address internal proposer;
    address internal user = address(0x2);

    uint256 internal constant WITHDRAWAL_DELAY = 1 days;
    uint256 internal constant SLASH_AMOUNT = 0.1 ether;
    uint256 internal constant MIN_BOND_AMOUNT = 0.1 ether;
    bytes32 internal constant PROOF_ROOT = bytes32(uint256(3));
    bytes32 internal constant PROOF_BLOCK_HASH = bytes32(uint256(1));
    bytes32 internal constant COMMITTED_TRANSACTION_HASH = bytes32(uint256(0x456));
    bytes32 internal constant INCLUDED_TRANSACTION_HASH = bytes32(uint256(0x789));
    uint64 internal constant COMMITTED_BLOCK_NUMBER = 100;
    uint64 internal constant COMMITTED_TRANSACTION_INDEX = 5;

    function setUp() public {
        proposer = vm.addr(proposerPrivateKey);

        mockVerifier = new MockTransactionInclusionVerifier();
        slasher = new TxInclusionPreciseSlasher(address(mockVerifier), WITHDRAWAL_DELAY);

        vm.deal(proposer, 10 ether);
        vm.deal(user, 10 ether);
    }

    function test_Constants() public view {
        assertEq(slasher.SLASH_AMOUNT(), SLASH_AMOUNT);
        assertEq(slasher.MIN_BOND_AMOUNT(), MIN_BOND_AMOUNT);
        assertEq(slasher.BURN_ADDRESS(), address(0));
        assertEq(slasher.WITHDRAWAL_DELAY(), WITHDRAWAL_DELAY);
        assertEq(slasher.INCLUSION_VERIFIER(), address(mockVerifier));
    }

    function test_AddBond() public {
        vm.prank(proposer);
        slasher.addBond{value: 1 ether}();

        assertEq(slasher.getProposerBond(proposer), 1 ether);
    }

    function test_AddBond_MultipleDeposits() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 0.5 ether}();
        slasher.addBond{value: 0.3 ether}();
        vm.stopPrank();

        assertEq(slasher.getProposerBond(proposer), 0.8 ether);
    }

    function testRevert_AddBond_InsufficientAmount() public {
        vm.prank(proposer);
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientBondAmount.selector);
        slasher.addBond{value: 0.05 ether}();
    }

    function test_InitiateWithdrawal() public {
        _bondProposer(1 ether);

        vm.prank(proposer);
        slasher.initiateWithdrawal(0.5 ether);

        assertEq(slasher.getPendingWithdrawal(proposer), 0.5 ether);
        assertEq(slasher.getWithdrawalTimestamp(proposer), block.timestamp + WITHDRAWAL_DELAY);
        assertEq(slasher.getProposerBond(proposer), 1 ether);
    }

    function testRevert_InitiateWithdrawal_InsufficientBond() public {
        _bondProposer(0.5 ether);

        vm.prank(proposer);
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientProposerBond.selector);
        slasher.initiateWithdrawal(1 ether);
    }

    function test_CompleteWithdrawal() public {
        _bondProposer(1 ether);

        vm.prank(proposer);
        slasher.initiateWithdrawal(0.5 ether);

        vm.warp(block.timestamp + WITHDRAWAL_DELAY + 1);

        uint256 balanceBefore = proposer.balance;
        vm.prank(proposer);
        slasher.completeWithdrawal();

        assertEq(slasher.getProposerBond(proposer), 0.5 ether);
        assertEq(slasher.getPendingWithdrawal(proposer), 0);
        assertEq(slasher.getWithdrawalTimestamp(proposer), 0);
        assertEq(proposer.balance, balanceBefore + 0.5 ether);
    }

    function testRevert_CompleteWithdrawal_NoWithdrawalInitiated() public {
        vm.prank(proposer);
        vm.expectRevert(TxInclusionPreciseSlasher.NoWithdrawalInitiated.selector);
        slasher.completeWithdrawal();
    }

    function testRevert_CompleteWithdrawal_DelayNotMet() public {
        _bondProposer(1 ether);

        vm.prank(proposer);
        slasher.initiateWithdrawal(0.5 ether);

        vm.prank(proposer);
        vm.expectRevert(TxInclusionPreciseSlasher.WithdrawalDelayNotMet.selector);
        slasher.completeWithdrawal();
    }

    function test_CreateCommitmentHash() public view {
        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );

        bytes32 domainSeparator = slasher.DOMAIN_SEPARATOR();
        bytes32 commitmentTypeHash = slasher.COMMITMENT_TYPEHASH();
        bytes32 structHash = keccak256(
            abi.encode(
                commitmentTypeHash,
                commitment.blockNumber,
                commitment.transactionHash,
                commitment.transactionIndex,
                commitment.deadline
            )
        );

        bytes32 expectedHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertEq(slasher.hashCommitment(commitment), expectedHash);
    }

    function test_SignCommitment() public view {
        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );

        bytes32 digest = slasher.hashCommitment(commitment);
        assertTrue(digest != bytes32(0));
    }

    function test_Slash_Success() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, true
        ));

        uint256 proposerBondBefore = slasher.getProposerBond(proposer);

        vm.prank(user);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());

        assertEq(slasher.getProposerBond(proposer), proposerBondBefore - SLASH_AMOUNT);
        assertTrue(slasher.isCommitmentSlashed(slasher.hashCommitment(commitment)));
    }

    function testRevert_Slash_CommitmentExpired() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp - 1
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.CommitmentExpired.selector);
        slasher.slash(commitment, proposer, v, r, s, new bytes(32), _dummyProof());
    }

    function testRevert_Slash_InvalidSignature() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x999, bytes32(uint256(0x123)));

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.InvalidSignature.selector);
        slasher.slash(commitment, proposer, v, r, s, new bytes(32), _dummyProof());
    }

    function testRevert_Slash_InsufficientBond() public {
        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientProposerBond.selector);
        slasher.slash(commitment, proposer, v, r, s, new bytes(32), _dummyProof());
    }

    function testRevert_Slash_AlreadySlashed() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, true
        ));

        vm.startPrank(user);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());
        vm.expectRevert(TxInclusionPreciseSlasher.CommitmentAlreadySlashed.selector);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());
        vm.stopPrank();
    }

    function testRevert_Slash_TransactionWasIncluded() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, true
        ));

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.TransactionWasIncluded.selector);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());
    }

    function testRevert_Slash_ProofMustDemonstrateInclusion() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, false
        ));

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.ProofMustDemonstrateInclusion.selector);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(false), _dummyProof());
    }

    function testRevert_Slash_TransactionIndexMismatch() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX + 2, true
        ));

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.TransactionIndexMismatch.selector);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());
    }

    function testRevert_Slash_BlockNumberMismatch() public {
        _bondProposer(1 ether);

        InclusionCommitment memory commitment = _makeCommitment(
            COMMITTED_BLOCK_NUMBER, COMMITTED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, block.timestamp + 1 hours
        );
        (uint8 v, bytes32 r, bytes32 s) = _signCommitment(commitment);

        mockVerifier.setMockReturn(_makeProofOutput(
            COMMITTED_BLOCK_NUMBER + 1, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, true
        ));

        vm.prank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.BlockNumberMismatch.selector);
        slasher.slash(commitment, proposer, v, r, s, _encodeProofOutput(true), _dummyProof());
    }

    function _bondProposer(uint256 amount) internal {
        vm.prank(proposer);
        slasher.addBond{value: amount}();
    }

    function _signCommitment(InclusionCommitment memory commitment)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return vm.sign(proposerPrivateKey, slasher.hashCommitment(commitment));
    }

    function _makeCommitment(
        uint64 blockNumber,
        bytes32 transactionHash,
        uint64 transactionIndex,
        uint256 deadline
    ) internal pure returns (InclusionCommitment memory) {
        return InclusionCommitment({
            blockNumber: blockNumber,
            transactionHash: transactionHash,
            transactionIndex: transactionIndex,
            deadline: deadline
        });
    }

    function _makeProofOutput(uint64 blockNumber, bytes32 transactionHash, uint64 transactionIndex, bool isIncluded)
        internal
        pure
        returns (PublicValuesStruct memory)
    {
        return PublicValuesStruct({
            blockHash: PROOF_BLOCK_HASH,
            blockNumber: blockNumber,
            transactionHash: transactionHash,
            transactionIndex: transactionIndex,
            isIncluded: isIncluded,
            verifiedAgainstRoot: PROOF_ROOT
        });
    }

    function _encodeProofOutput(bool isIncluded) internal pure returns (bytes memory) {
        return abi.encode(_makeProofOutput(COMMITTED_BLOCK_NUMBER, INCLUDED_TRANSACTION_HASH, COMMITTED_TRANSACTION_INDEX, isIncluded));
    }

    function _dummyProof() internal pure returns (bytes memory) {
        return new bytes(32);
    }
}
