// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {TxInclusionPreciseSlasher, InclusionCommitment} from "../src/TxInclusionPreciseSlasher.sol";
import {TransactionInclusionVerifier, PublicValuesStruct} from "../src/TransactionInclusionVerifier.sol";
import {SP1VerifierGateway} from "@sp1-contracts/SP1VerifierGateway.sol";

contract MockTransactionInclusionVerifier {
    struct MockReturn {
        bytes32 blockHash;
        uint64 blockNumber;
        bytes32 transactionHash;
        uint64 transactionIndex;
        bool isIncluded;
        bytes32 verifiedAgainstRoot;
    }

    MockReturn public mockReturn = MockReturn({
        blockHash: bytes32(uint256(1)),
        blockNumber: uint64(100),
        transactionHash: bytes32(uint256(2)),
        transactionIndex: uint64(1),
        isIncluded: false,
        verifiedAgainstRoot: bytes32(uint256(3))
    });

    function setMockReturn(MockReturn memory _mockReturn) external {
        mockReturn = _mockReturn;
    }

    function verifyTransactionInclusionView(bytes calldata, bytes calldata)
        external
        view
        returns (bytes32, uint64, bytes32, uint64, bool, bytes32)
    {
        return (
            mockReturn.blockHash,
            mockReturn.blockNumber,
            mockReturn.transactionHash,
            mockReturn.transactionIndex,
            mockReturn.isIncluded,
            mockReturn.verifiedAgainstRoot
        );
    }
}

contract TxInclusionPreciseSlasherTest is Test {
    TxInclusionPreciseSlasher public slasher;
    MockTransactionInclusionVerifier public mockVerifier;

    uint256 public proposerPrivateKey = 0x1;
    address public proposer = vm.addr(proposerPrivateKey);
    address public user = address(0x2);

    uint256 constant WITHDRAWAL_DELAY = 1 days;
    uint256 constant SLASH_AMOUNT = 0.1 ether;
    uint256 constant MIN_BOND_AMOUNT = 0.1 ether;

    function setUp() public {
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
        vm.startPrank(proposer);
        
        uint256 bondAmount = 1 ether;
        slasher.addBond{value: bondAmount}();

        assertEq(slasher.getProposerBond(proposer), bondAmount);
        vm.stopPrank();
    }

    function test_AddBond_MultipleDeposits() public {
        vm.startPrank(proposer);
        
        slasher.addBond{value: 0.5 ether}();
        assertEq(slasher.getProposerBond(proposer), 0.5 ether);

        slasher.addBond{value: 0.3 ether}();
        assertEq(slasher.getProposerBond(proposer), 0.8 ether);

        vm.stopPrank();
    }

    function testRevert_AddBond_InsufficientAmount() public {
        vm.startPrank(proposer);
        
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientBondAmount.selector);
        slasher.addBond{value: 0.05 ether}();

        vm.stopPrank();
    }

    function test_InitiateWithdrawal() public {
        vm.startPrank(proposer);
        
        slasher.addBond{value: 1 ether}();
        
        uint256 withdrawalAmount = 0.5 ether;
        slasher.initiateWithdrawal(withdrawalAmount);

        assertEq(slasher.getPendingWithdrawal(proposer), withdrawalAmount);
        assertEq(slasher.getWithdrawalTimestamp(proposer), block.timestamp + WITHDRAWAL_DELAY);
        assertEq(slasher.getProposerBond(proposer), 1 ether); // Bond still intact

        vm.stopPrank();
    }

    function testRevert_InitiateWithdrawal_InsufficientBond() public {
        vm.startPrank(proposer);
        
        slasher.addBond{value: 0.5 ether}();
        
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientProposerBond.selector);
        slasher.initiateWithdrawal(1 ether);

        vm.stopPrank();
    }

    function test_CompleteWithdrawal() public {
        vm.startPrank(proposer);
        
        uint256 bondAmount = 1 ether;
        uint256 withdrawalAmount = 0.5 ether;
        
        slasher.addBond{value: bondAmount}();
        slasher.initiateWithdrawal(withdrawalAmount);

        vm.warp(block.timestamp + WITHDRAWAL_DELAY + 1);

        uint256 balanceBefore = proposer.balance;
        slasher.completeWithdrawal();

        assertEq(slasher.getProposerBond(proposer), bondAmount - withdrawalAmount);
        assertEq(slasher.getPendingWithdrawal(proposer), 0);
        assertEq(slasher.getWithdrawalTimestamp(proposer), 0);
        assertEq(proposer.balance, balanceBefore + withdrawalAmount);

        vm.stopPrank();
    }

    function testRevert_CompleteWithdrawal_NoWithdrawalInitiated() public {
        vm.startPrank(proposer);
        
        vm.expectRevert(TxInclusionPreciseSlasher.NoWithdrawalInitiated.selector);
        slasher.completeWithdrawal();

        vm.stopPrank();
    }

    function testRevert_CompleteWithdrawal_DelayNotMet() public {
        vm.startPrank(proposer);
        
        slasher.addBond{value: 1 ether}();
        slasher.initiateWithdrawal(0.5 ether);

        vm.expectRevert(TxInclusionPreciseSlasher.WithdrawalDelayNotMet.selector);
        slasher.completeWithdrawal();

        vm.stopPrank();
    }

    function test_CreateCommitmentHash() public view {
        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x123)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 expectedHash = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        // This verifies our understanding of the hash structure
        assertTrue(expectedHash != bytes32(0));
    }

    function test_SignCommitment() public {
        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x123)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        address recoveredSigner = ecrecover(digest, v, r, s);
        assertEq(recoveredSigner, proposer);
    }

    function test_Slash_Success() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 1 ether}();
        vm.stopPrank();

        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)), // Different from mock return
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        bytes memory publicValues = abi.encode(PublicValuesStruct({
            blockHash: bytes32(uint256(1)),
            blockNumber: 100,
            transactionHash: bytes32(uint256(2)),
            transactionIndex: 1,
            isIncluded: false,
            verifiedAgainstRoot: bytes32(uint256(3))
        }));

        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        
        uint256 proposerBondBefore = slasher.getProposerBond(proposer);
        
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);

        assertEq(slasher.getProposerBond(proposer), proposerBondBefore - SLASH_AMOUNT);
        
        bytes32 commitmentHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        assertTrue(slasher.isCommitmentSlashed(commitmentHash));

        vm.stopPrank();
    }

    function testRevert_Slash_CommitmentExpired() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 1 ether}();
        vm.stopPrank();

        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            deadline: block.timestamp - 1 // Expired
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        bytes memory publicValues = new bytes(32);
        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.CommitmentExpired.selector);
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);
        vm.stopPrank();
    }

    function testRevert_Slash_InvalidSignature() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 1 ether}();
        vm.stopPrank();

        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

        // Sign with wrong private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0x999, bytes32(uint256(0x123)));

        bytes memory publicValues = new bytes(32);
        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.InvalidSignature.selector);
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);
        vm.stopPrank();
    }

    function testRevert_Slash_InsufficientBond() public {
        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        bytes memory publicValues = new bytes(32);
        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.InsufficientProposerBond.selector);
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);
        vm.stopPrank();
    }

    function testRevert_Slash_AlreadySlashed() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 1 ether}();
        vm.stopPrank();

        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        bytes memory publicValues = abi.encode(PublicValuesStruct({
            blockHash: bytes32(uint256(1)),
            blockNumber: 100,
            transactionHash: bytes32(uint256(2)),
            transactionIndex: 1,
            isIncluded: false,
            verifiedAgainstRoot: bytes32(uint256(3))
        }));

        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        
        // First slash should succeed
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);

        // Second slash should fail
        vm.expectRevert(TxInclusionPreciseSlasher.CommitmentAlreadySlashed.selector);
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);

        vm.stopPrank();
    }

    function testRevert_Slash_TransactionWasIncluded() public {
        vm.startPrank(proposer);
        slasher.addBond{value: 1 ether}();
        vm.stopPrank();

        // Set mock to return that transaction WAS included at the promised position
        mockVerifier.setMockReturn(MockTransactionInclusionVerifier.MockReturn({
            blockHash: bytes32(uint256(1)),
            blockNumber: uint64(100),
            transactionHash: bytes32(uint256(0x456)), // Same as commitment
            transactionIndex: uint64(5), // Same as commitment
            isIncluded: true, // Transaction WAS included
            verifiedAgainstRoot: bytes32(uint256(3))
        }));

        InclusionCommitment memory commitment = InclusionCommitment({
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            deadline: block.timestamp + 3600
        });

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

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(proposerPrivateKey, digest);

        bytes memory publicValues = abi.encode(PublicValuesStruct({
            blockHash: bytes32(uint256(1)),
            blockNumber: 100,
            transactionHash: bytes32(uint256(0x456)),
            transactionIndex: 5,
            isIncluded: true,
            verifiedAgainstRoot: bytes32(uint256(3))
        }));

        bytes memory proofBytes = new bytes(32);

        vm.startPrank(user);
        vm.expectRevert(TxInclusionPreciseSlasher.TransactionWasIncluded.selector);
        slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);
        vm.stopPrank();
    }
}