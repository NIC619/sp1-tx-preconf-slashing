// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {TransactionInclusionVerifier} from "../src/TransactionInclusionVerifier.sol";
import {SP1VerifierGateway} from "@sp1-contracts/SP1VerifierGateway.sol";

// @dev Name of struct params need to follow alphabetic order. Otherwise, `abi.decode` will revert.
// see: https://getfoundry.sh/reference/cheatcodes/parse-json#how-to-use-stdjson
struct SP1ProofFixtureJson {
    bytes32 blockHash;
    uint64 blockNumber;
    bool isIncluded;
    bytes proof;
    bytes publicValues;
    bytes32 transactionHash;
    uint64 transactionIndex;
    bytes32 verifiedAgainstRoot;
    bytes32 vkey;
}

contract TransactionInclusionGroth16Test is Test {
    using stdJson for string;

    address verifier;
    TransactionInclusionVerifier public txInclusionVerifier;

    function loadFixture() public view returns (SP1ProofFixtureJson memory) {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/src/fixtures/groth16-fixture.json");
        string memory json = vm.readFile(path);
        bytes memory jsonBytes = json.parseRaw(".");
        return abi.decode(jsonBytes, (SP1ProofFixtureJson));
    }

    function setUp() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        verifier = address(new SP1VerifierGateway(address(1)));
        txInclusionVerifier = new TransactionInclusionVerifier(verifier, fixture.vkey);
    }

    function test_ValidTransactionInclusionProof() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        vm.mockCall(verifier, abi.encodeWithSelector(SP1VerifierGateway.verifyProof.selector), abi.encode(true));

        (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) = txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, fixture.proof);

        assertEq(blockHash, fixture.blockHash);
        assertEq(blockNumber, fixture.blockNumber);
        assertEq(transactionHash, fixture.transactionHash);
        assertEq(transactionIndex, fixture.transactionIndex);
        assertEq(isIncluded, fixture.isIncluded);
        assertEq(verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function test_ValidTransactionInclusionProofView() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        vm.mockCall(verifier, abi.encodeWithSelector(SP1VerifierGateway.verifyProof.selector), abi.encode(true));

        (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) = txInclusionVerifier.verifyTransactionInclusionView(fixture.publicValues, fixture.proof);

        assertEq(blockHash, fixture.blockHash);
        assertEq(blockNumber, fixture.blockNumber);
        assertEq(transactionHash, fixture.transactionHash);
        assertEq(transactionIndex, fixture.transactionIndex);
        assertEq(isIncluded, fixture.isIncluded);
        assertEq(verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function testRevert_InvalidTransactionInclusionProof() public {
        vm.expectRevert();

        SP1ProofFixtureJson memory fixture = loadFixture();

        // Create a fake proof.
        bytes memory fakeProof = new bytes(fixture.proof.length);

        txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, fakeProof);
    }
}


contract TransactionInclusionPlonkTest is Test {
    using stdJson for string;

    address verifier;
    TransactionInclusionVerifier public txInclusionVerifier;

    function loadFixture() public view returns (SP1ProofFixtureJson memory) {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/src/fixtures/plonk-fixture.json");
        string memory json = vm.readFile(path);
        bytes memory jsonBytes = json.parseRaw(".");
        return abi.decode(jsonBytes, (SP1ProofFixtureJson));
    }

    function setUp() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        verifier = address(new SP1VerifierGateway(address(1)));
        txInclusionVerifier = new TransactionInclusionVerifier(verifier, fixture.vkey);
    }

    function test_ValidTransactionInclusionProof() public {
        // Plonk proof has not been generated yet.
        vm.skip(true);
        SP1ProofFixtureJson memory fixture = loadFixture();

        vm.mockCall(verifier, abi.encodeWithSelector(SP1VerifierGateway.verifyProof.selector), abi.encode(true));

        (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) = txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, fixture.proof);

        assertEq(blockHash, fixture.blockHash);
        assertEq(blockNumber, fixture.blockNumber);
        assertEq(transactionHash, fixture.transactionHash);
        assertEq(transactionIndex, fixture.transactionIndex);
        assertEq(isIncluded, fixture.isIncluded);
        assertEq(verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function test_ValidTransactionInclusionProofView() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        vm.mockCall(verifier, abi.encodeWithSelector(SP1VerifierGateway.verifyProof.selector), abi.encode(true));

        (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) = txInclusionVerifier.verifyTransactionInclusionView(fixture.publicValues, fixture.proof);

        assertEq(blockHash, fixture.blockHash);
        assertEq(blockNumber, fixture.blockNumber);
        assertEq(transactionHash, fixture.transactionHash);
        assertEq(transactionIndex, fixture.transactionIndex);
        assertEq(isIncluded, fixture.isIncluded);
        assertEq(verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function testRevert_InvalidTransactionInclusionProof() public {
        // Plonk proof has not been generated yet.
        vm.skip(true);

        vm.expectRevert();

        SP1ProofFixtureJson memory fixture = loadFixture();

        // Create a fake proof.
        bytes memory fakeProof = new bytes(fixture.proof.length);

        txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, fakeProof);
    }
}
