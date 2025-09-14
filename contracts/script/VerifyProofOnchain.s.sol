// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {TransactionInclusionVerifier} from "../src/TransactionInclusionVerifier.sol";

// @dev Name of struct params need to follow alphabetic order for abi.decode
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

contract VerifyProofOnchain is Script {
    using stdJson for string;

    address constant DEPLOYED_VERIFIER = 0x5493090647159c35579AE984032D612166C6357F;

    function loadFixture() public view returns (SP1ProofFixtureJson memory) {
        string memory root = vm.projectRoot();
        // Use stable test fixture that won't change when new proofs are generated
        string memory path = string.concat(root, "/src/fixtures/groth16-fixture-for-tests.json");
        string memory json = vm.readFile(path);
        bytes memory jsonBytes = json.parseRaw(".");
        return abi.decode(jsonBytes, (SP1ProofFixtureJson));
    }

    function run() external {
        // Load the proof fixture
        SP1ProofFixtureJson memory fixture = loadFixture();

        console2.log("=== VERIFYING TRANSACTION INCLUSION PROOF ON-CHAIN ===");
        console2.log("Deployed Verifier Contract:", DEPLOYED_VERIFIER);
        console2.log("Network: Sepolia");
        console2.log("");
        
        console2.log("Proof Data:");
        console2.log("- Block Hash:", vm.toString(fixture.blockHash));
        console2.log("- Block Number:", fixture.blockNumber);
        console2.log("- Transaction Hash:", vm.toString(fixture.transactionHash));
        console2.log("- Transaction Index:", fixture.transactionIndex);
        console2.log("- Is Included:", fixture.isIncluded);
        console2.log("- Verified Against Root:", vm.toString(fixture.verifiedAgainstRoot));
        console2.log("- Verification Key:", vm.toString(fixture.vkey));
        console2.log("- Public Values Length:", fixture.publicValues.length, "bytes");
        console2.log("- Proof Length:", fixture.proof.length, "bytes");
        console2.log("");

        // Start broadcasting transactions
        vm.startBroadcast();

        // Create contract instance
        TransactionInclusionVerifier verifier = TransactionInclusionVerifier(DEPLOYED_VERIFIER);

        console2.log("Calling verifyTransactionInclusion...");
        
        // Call the verification function
        try verifier.verifyTransactionInclusion(fixture.publicValues, fixture.proof) returns (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) {
            console2.log("");
            console2.log("=== VERIFICATION SUCCESSFUL! ===");
            console2.log("Returned values:");
            console2.log("- Block Hash:", vm.toString(blockHash));
            console2.log("- Block Number:", blockNumber);
            console2.log("- Transaction Hash:", vm.toString(transactionHash));
            console2.log("- Transaction Index:", transactionIndex);
            console2.log("- Is Included:", isIncluded);
            console2.log("- Verified Against Root:", vm.toString(verifiedAgainstRoot));
            console2.log("");

            // Verify the returned values match our expectations
            require(blockHash == fixture.blockHash, "Block hash mismatch");
            require(blockNumber == fixture.blockNumber, "Block number mismatch");
            require(transactionHash == fixture.transactionHash, "Transaction hash mismatch");
            require(transactionIndex == fixture.transactionIndex, "Transaction index mismatch");
            require(isIncluded == fixture.isIncluded, "Is included mismatch");
            require(verifiedAgainstRoot == fixture.verifiedAgainstRoot, "Verified against root mismatch");

            console2.log("ALL VALUES VERIFIED CORRECTLY!");
            console2.log("TRANSACTION INCLUSION PROOF VERIFIED ON-CHAIN!");
            
        } catch Error(string memory reason) {
            console2.log("");
            console2.log("X VERIFICATION FAILED!");
            console2.log("Reason:", reason);
            revert(string.concat("Verification failed: ", reason));
            
        } catch (bytes memory lowLevelData) {
            console2.log("");
            console2.log("X VERIFICATION FAILED!");
            console2.log("Low level error data length:", lowLevelData.length);
            if (lowLevelData.length > 0) {
                console2.logBytes(lowLevelData);
            }
            revert("Verification failed with low-level error");
        }

        vm.stopBroadcast();
    }

    function runView() external view {
        // Load the proof fixture
        SP1ProofFixtureJson memory fixture = loadFixture();

        console2.log("=== TESTING TRANSACTION INCLUSION PROOF (VIEW ONLY) ===");
        console2.log("Deployed Verifier Contract:", DEPLOYED_VERIFIER);
        console2.log("Network: Sepolia");
        console2.log("");

        // Create contract instance
        TransactionInclusionVerifier verifier = TransactionInclusionVerifier(DEPLOYED_VERIFIER);

        console2.log("Calling verifyTransactionInclusionView...");

        try verifier.verifyTransactionInclusionView(fixture.publicValues, fixture.proof) returns (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        ) {
            console2.log("");
            console2.log("=== VIEW VERIFICATION SUCCESSFUL! ===");
            console2.log("Returned values:");
            console2.log("- Block Hash:", vm.toString(blockHash));
            console2.log("- Block Number:", blockNumber);
            console2.log("- Transaction Hash:", vm.toString(transactionHash));
            console2.log("- Transaction Index:", transactionIndex);
            console2.log("- Is Included:", isIncluded);
            console2.log("- Verified Against Root:", vm.toString(verifiedAgainstRoot));
            console2.log("");
            console2.log("SUCCESS VIEW VERIFICATION SUCCESSFUL!");
            
        } catch Error(string memory reason) {
            console2.log("");
            console2.log("X VIEW VERIFICATION FAILED!");
            console2.log("Reason:", reason);
            
        } catch (bytes memory lowLevelData) {
            console2.log("");
            console2.log("X VIEW VERIFICATION FAILED!");
            console2.log("Low level error data length:", lowLevelData.length);
            if (lowLevelData.length > 0) {
                console2.logBytes(lowLevelData);
            }
        }
    }

    // Helper function to check contract state
    function checkContract() external view {
        console2.log("=== CONTRACT STATE CHECK ===");
        console2.log("Verifier Contract:", DEPLOYED_VERIFIER);
        
        TransactionInclusionVerifier verifier = TransactionInclusionVerifier(DEPLOYED_VERIFIER);
        
        console2.log("SP1 Verifier Gateway:", verifier.verifier());
        console2.log("Program VKey:", vm.toString(verifier.txInclusionProgramVKey()));
        
        SP1ProofFixtureJson memory fixture = loadFixture();
        console2.log("Expected VKey:", vm.toString(fixture.vkey));
        
        if (verifier.txInclusionProgramVKey() == fixture.vkey) {
            console2.log("SUCCESS VKey matches fixture");
        } else {
            console2.log("X VKey mismatch!");
        }
    }
}