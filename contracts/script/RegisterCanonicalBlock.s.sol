// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {DeploymentEnvReader} from "./DeploymentEnvReader.sol";
import {TxInclusionPreciseSlasher} from "../src/TxInclusionPreciseSlasher.sol";

contract RegisterCanonicalBlock is DeploymentEnvReader {
    function run() external {
        uint256 ownerPrivateKey = vm.envUint("OWNER_PRIVATE_KEY");
        uint64 blockNumber = uint64(vm.envUint("BLOCK_NUMBER"));
        bytes32 blockHash = vm.envBytes32("BLOCK_HASH");
        uint256 blockTimestamp = vm.envUint("BLOCK_TIMESTAMP");
        address slasherAddress = _readDeploymentAddress("TX_INCLUSION_PRECISE_SLASHER");

        console2.log("=== REGISTERING CANONICAL BLOCK ===");
        console2.log("Slasher:", slasherAddress);
        console2.log("Block Number:", blockNumber);
        console2.log("Block Hash:", vm.toString(blockHash));
        console2.log("Block Timestamp:", blockTimestamp);

        vm.startBroadcast(ownerPrivateKey);
        TxInclusionPreciseSlasher(slasherAddress).registerCanonicalBlock(blockNumber, blockHash, blockTimestamp);
        vm.stopBroadcast();

        console2.log("Canonical block registered.");
    }
}
