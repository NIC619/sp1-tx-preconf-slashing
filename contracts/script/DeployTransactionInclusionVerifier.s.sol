// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TransactionInclusionVerifier} from "../src/TransactionInclusionVerifier.sol";

contract DeployTransactionInclusionVerifier is Script {
    function run() external {
        // Load environment variables (Foundry automatically loads from .env)
        address verifierAddress = vm.envAddress("SP1_VERIFIER_ADDRESS");
        bytes32 vkey = vm.envBytes32("TX_INCLUSION_PROGRAM_VKEY");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("=== DEPLOYING TRANSACTION INCLUSION VERIFIER ===");
        console2.log("SP1 Verifier Address:", verifierAddress);
        console2.log("Program VKey:", vm.toString(vkey));
        console2.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        TransactionInclusionVerifier verifier = new TransactionInclusionVerifier(
            verifierAddress,
            vkey
        );
        
        vm.stopBroadcast();
        
        console2.log("");
        console2.log("=== DEPLOYMENT SUCCESSFUL ===");
        console2.log("Contract Address:", address(verifier));
        console2.log("Owner:", verifier.owner());
        console2.log("SP1 Verifier:", verifier.verifier());
        console2.log("Program VKey:", vm.toString(verifier.txInclusionProgramVKey()));
        
        // Save deployment info
        string memory deploymentInfo = string(abi.encodePacked(
            "TRANSACTION_INCLUSION_VERIFIER=", vm.toString(address(verifier)), "\n",
            "OWNER=", vm.toString(deployer), "\n",
            "SP1_VERIFIER=", vm.toString(verifier.verifier()), "\n",
            "PROGRAM_VKEY=", vm.toString(verifier.txInclusionProgramVKey()), "\n"
        ));
        
        vm.writeFile("deployment.env", deploymentInfo);
        
        console2.log("");
        console2.log("=== VERIFICATION COMMANDS ===");
        console2.log("To verify on Etherscan, run:");
        console2.log("");
        console2.log("forge verify-contract \\");
        console2.log(string(abi.encodePacked("  ", vm.toString(address(verifier)), " \\")));
        console2.log("  src/TransactionInclusionVerifier.sol:TransactionInclusionVerifier \\");
        console2.log(string(abi.encodePacked("  --constructor-args $(cast abi-encode \"constructor(address,bytes32)\" ", vm.toString(verifierAddress), " ", vm.toString(vkey), ") \\")));
        console2.log("  --etherscan-api-key $ETHERSCAN_API_KEY \\");
        console2.log("  --watch");
        console2.log("");
        console2.log("Or using the environment variables:");
        console2.log("source deployment.env && forge verify-contract \\");
        console2.log("  $TRANSACTION_INCLUSION_VERIFIER \\");
        console2.log("  src/TransactionInclusionVerifier.sol:TransactionInclusionVerifier \\");
        console2.log("  --constructor-args $(cast abi-encode \"constructor(address,bytes32)\" $SP1_VERIFIER $PROGRAM_VKEY) \\");
        console2.log("  --etherscan-api-key $ETHERSCAN_API_KEY \\");
        console2.log("  --watch");
    }
}