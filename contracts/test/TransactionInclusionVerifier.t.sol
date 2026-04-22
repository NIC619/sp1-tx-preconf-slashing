// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {
    ITransactionInclusionVerifier,
    PublicValuesStruct,
    TransactionInclusionVerifier
} from "../src/TransactionInclusionVerifier.sol";
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

abstract contract TransactionInclusionVerifierTestBase is Test {
    using stdJson for string;

    event TransactionInclusionVerified(
        bytes32 indexed blockHash,
        uint64 indexed blockNumber,
        bytes32 indexed transactionHash,
        uint64 transactionIndex,
        bool isIncluded
    );

    event VerificationKeyUpdated(bytes32 indexed oldVKey, bytes32 indexed newVKey);

    address internal verifier;
    address internal nonOwner = address(0xBEEF);
    TransactionInclusionVerifier internal txInclusionVerifier;

    function fixturePath() internal view virtual returns (string memory);

    function loadFixture() internal view returns (SP1ProofFixtureJson memory) {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, fixturePath());
        string memory json = vm.readFile(path);
        bytes memory jsonBytes = json.parseRaw(".");
        return abi.decode(jsonBytes, (SP1ProofFixtureJson));
    }

    function setUp() public virtual {
        SP1ProofFixtureJson memory fixture = loadFixture();

        verifier = address(new SP1VerifierGateway(address(1)));
        txInclusionVerifier = new TransactionInclusionVerifier(verifier, fixture.vkey);
    }

    function test_ValidTransactionInclusionProof() public {
        SP1ProofFixtureJson memory fixture = loadFixture();
        _mockProofVerification(fixture.publicValues, fixture.proof);

        vm.expectEmit(address(txInclusionVerifier));
        emit TransactionInclusionVerified(
            fixture.blockHash,
            fixture.blockNumber,
            fixture.transactionHash,
            fixture.transactionIndex,
            fixture.isIncluded
        );

        (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) = txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, fixture.proof);

        _assertFixtureValues(
            fixture, blockHash, blockNumber, transactionHash, transactionIndex, isIncluded, verifiedAgainstRoot
        );
    }

    function test_ValidTransactionInclusionProofView() public {
        SP1ProofFixtureJson memory fixture = loadFixture();
        _mockProofVerification(fixture.publicValues, fixture.proof);

        PublicValuesStruct memory publicValues =
            ITransactionInclusionVerifier(address(txInclusionVerifier)).verifyTransactionInclusionView(
                fixture.publicValues, fixture.proof
            );

        _assertDecodedValues(fixture, publicValues);
    }

    function test_DecodePublicValues() public view {
        SP1ProofFixtureJson memory fixture = loadFixture();

        PublicValuesStruct memory publicValues = txInclusionVerifier.decodePublicValues(fixture.publicValues);

        _assertDecodedValues(fixture, publicValues);
    }

    function test_UpdateVerificationKey() public {
        SP1ProofFixtureJson memory fixture = loadFixture();
        bytes32 newVKey = keccak256("new-vkey");

        vm.expectEmit(address(txInclusionVerifier));
        emit VerificationKeyUpdated(fixture.vkey, newVKey);

        txInclusionVerifier.updateVerificationKey(newVKey);

        assertEq(txInclusionVerifier.txInclusionProgramVKey(), newVKey);
    }

    function testRevert_UpdateVerificationKey_NotOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(TransactionInclusionVerifier.OnlyOwner.selector);
        txInclusionVerifier.updateVerificationKey(bytes32(uint256(1)));
    }

    function testRevert_InvalidTransactionInclusionProof() public {
        SP1ProofFixtureJson memory fixture = loadFixture();

        vm.expectRevert();
        txInclusionVerifier.verifyTransactionInclusion(fixture.publicValues, new bytes(fixture.proof.length));
    }

    function _mockProofVerification(bytes memory publicValues, bytes memory proof) internal {
        vm.mockCall(
            verifier,
            abi.encodeWithSelector(SP1VerifierGateway.verifyProof.selector, txInclusionVerifier.txInclusionProgramVKey(), publicValues, proof),
            abi.encode()
        );
    }

    function _assertFixtureValues(
        SP1ProofFixtureJson memory fixture,
        bytes32 blockHash,
        uint64 blockNumber,
        bytes32 transactionHash,
        uint64 transactionIndex,
        bool isIncluded,
        bytes32 verifiedAgainstRoot
    ) internal pure {
        assertEq(blockHash, fixture.blockHash);
        assertEq(blockNumber, fixture.blockNumber);
        assertEq(transactionHash, fixture.transactionHash);
        assertEq(transactionIndex, fixture.transactionIndex);
        assertEq(isIncluded, fixture.isIncluded);
        assertEq(verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function _assertDecodedValues(SP1ProofFixtureJson memory fixture, PublicValuesStruct memory publicValues)
        internal
        pure
    {
        assertEq(publicValues.blockHash, fixture.blockHash);
        assertEq(publicValues.blockNumber, fixture.blockNumber);
        assertEq(publicValues.transactionHash, fixture.transactionHash);
        assertEq(publicValues.transactionIndex, fixture.transactionIndex);
        assertEq(publicValues.isIncluded, fixture.isIncluded);
        assertEq(publicValues.verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }
}

contract TransactionInclusionGroth16Test is TransactionInclusionVerifierTestBase {
    function fixturePath() internal pure override returns (string memory) {
        return "/src/fixtures/groth16-fixture-for-tests.json";
    }
}

contract TransactionInclusionPlonkTest is TransactionInclusionVerifierTestBase {
    function fixturePath() internal pure override returns (string memory) {
        return "/src/fixtures/plonk-fixture-for-tests.json";
    }
}
