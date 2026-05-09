// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";

abstract contract DeploymentEnvReader is Script {
    function _readDeploymentAddress(string memory key) internal view returns (address) {
        string memory deploymentEnv = vm.readFile("deployment.env");
        bytes memory data = bytes(deploymentEnv);
        bytes memory prefix = bytes(string.concat(key, "="));

        for (uint256 i = 0; i + prefix.length <= data.length; i++) {
            bool matches = true;
            for (uint256 j = 0; j < prefix.length; j++) {
                if (data[i + j] != prefix[j]) {
                    matches = false;
                    break;
                }
            }

            if (matches && (i == 0 || data[i - 1] == "\n")) {
                uint256 valueStart = i + prefix.length;
                uint256 valueEnd = valueStart;
                while (valueEnd < data.length && data[valueEnd] != "\n" && data[valueEnd] != "\r") {
                    valueEnd++;
                }

                bytes memory value = new bytes(valueEnd - valueStart);
                for (uint256 k = 0; k < value.length; k++) {
                    value[k] = data[valueStart + k];
                }

                return vm.parseAddress(string(value));
            }
        }

        revert(string.concat("Missing deployment.env key: ", key));
    }
}
