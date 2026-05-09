// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeploymentEnvReader} from "./DeploymentEnvReader.sol";
import {TxInclusionPreciseSlasher} from "../src/TxInclusionPreciseSlasher.sol";

contract DeployTxInclusionPreciseSlasher is DeploymentEnvReader {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 withdrawalDelay = 100 seconds;

        address inclusionVerifier = _readDeploymentAddress("TRANSACTION_INCLUSION_VERIFIER");

        vm.startBroadcast(deployerPrivateKey);

        TxInclusionPreciseSlasher slasher = new TxInclusionPreciseSlasher(
            inclusionVerifier,
            withdrawalDelay
        );

        console.log("TxInclusionPreciseSlasher deployed at:", address(slasher));
        console.log("Inclusion Verifier:", inclusionVerifier);
        console.log("Withdrawal Delay (seconds):", withdrawalDelay);
        console.log("Slash Amount:", slasher.SLASH_AMOUNT());
        console.log("Min Bond Amount:", slasher.MIN_BOND_AMOUNT());

        vm.stopBroadcast();

        // Write deployment info to file
        string memory deploymentInfo = string.concat(
            "TX_INCLUSION_PRECISE_SLASHER=", vm.toString(address(slasher)), "\n",
            "WITHDRAWAL_DELAY=", vm.toString(withdrawalDelay), "\n",
            "SLASH_AMOUNT=", vm.toString(slasher.SLASH_AMOUNT()), "\n",
            "MIN_BOND_AMOUNT=", vm.toString(slasher.MIN_BOND_AMOUNT()), "\n"
        );

        vm.writeFile("slasher-deployment.tmp", deploymentInfo);
    }
}
