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
struct SP1ProofFixtureJsonE2E {
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

contract GeneratedFixtureE2ETest is Test {
    using stdJson for string;

    function test_GeneratedFixtureRoundTrip() public {
        string memory path = vm.envOr("TX_INCLUSION_E2E_FIXTURE_PATH", string(""));
        if (bytes(path).length == 0) {
            return;
        }

        SP1ProofFixtureJsonE2E memory fixture = _loadFixture(path);

        address verifier = address(new SP1VerifierGateway(address(1)));
        TransactionInclusionVerifier txInclusionVerifier =
            new TransactionInclusionVerifier(verifier, fixture.vkey);

        vm.mockCall(
            verifier,
            abi.encodeWithSelector(
                SP1VerifierGateway.verifyProof.selector,
                txInclusionVerifier.txInclusionProgramVKey(),
                fixture.publicValues,
                fixture.proof
            ),
            abi.encode()
        );

        PublicValuesStruct memory decoded =
            ITransactionInclusionVerifier(address(txInclusionVerifier)).verifyTransactionInclusionView(
                fixture.publicValues, fixture.proof
            );

        assertEq(decoded.blockHash, fixture.blockHash);
        assertEq(decoded.blockNumber, fixture.blockNumber);
        assertEq(decoded.transactionHash, fixture.transactionHash);
        assertEq(decoded.transactionIndex, fixture.transactionIndex);
        assertEq(decoded.isIncluded, fixture.isIncluded);
        assertEq(decoded.verifiedAgainstRoot, fixture.verifiedAgainstRoot);
    }

    function _loadFixture(string memory path) internal view returns (SP1ProofFixtureJsonE2E memory) {
        string memory json = vm.readFile(path);
        bytes memory jsonBytes = json.parseRaw(".");
        return abi.decode(jsonBytes, (SP1ProofFixtureJsonE2E));
    }
}
