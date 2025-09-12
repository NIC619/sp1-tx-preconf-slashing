// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";

struct PublicValuesStruct {
    bytes32 blockHash;
    uint64 blockNumber;
    bytes32 transactionHash;
    uint64 transactionIndex;
    bool isIncluded;
    bytes32 verifiedAgainstRoot;
}

/// @title TransactionInclusionVerifier
/// @author Your Project
/// @notice This contract implements verification of ZK proofs for transaction inclusion
///         at precise indices in Ethereum blocks using SP1.
contract TransactionInclusionVerifier {
    /// @notice The owner of the contract (deployer).
    address public owner;

    /// @notice The address of the SP1 verifier contract.
    /// @dev This can either be a specific SP1Verifier for a specific version, or the
    ///      SP1VerifierGateway which can be used to verify proofs for any version of SP1.
    ///      For the list of supported verifiers on each chain, see:
    ///      https://github.com/succinctlabs/sp1-contracts/tree/main/contracts/deployments
    address public verifier;

    /// @notice The verification key for the transaction inclusion program.
    bytes32 public txInclusionProgramVKey;

    /// @notice Event emitted when a transaction inclusion proof is verified
    event TransactionInclusionVerified(
        bytes32 indexed blockHash,
        uint64 indexed blockNumber,
        bytes32 indexed transactionHash,
        uint64 transactionIndex,
        bool isIncluded
    );

    /// @notice Event emitted when the verification key is updated
    event VerificationKeyUpdated(bytes32 indexed oldVKey, bytes32 indexed newVKey);

    /// @notice Modifier to restrict access to owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(address _verifier, bytes32 _txInclusionProgramVKey) {
        owner = msg.sender; // Set deployer as owner
        verifier = _verifier;
        txInclusionProgramVKey = _txInclusionProgramVKey;
    }

    /// @notice The entrypoint for verifying transaction inclusion proofs.
    /// @param _publicValues The encoded public values.
    /// @param _proofBytes The encoded proof.
    /// @return blockHash The hash of the block containing the transaction
    /// @return blockNumber The number of the block containing the transaction
    /// @return transactionHash The hash of the transaction being verified
    /// @return transactionIndex The index of the transaction within the block
    /// @return isIncluded Whether the transaction is included in the block
    /// @return verifiedAgainstRoot The merkle root that the proof was verified against
    function verifyTransactionInclusion(bytes calldata _publicValues, bytes calldata _proofBytes)
        public
        returns (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        )
    {
        // Verify the proof using SP1
        ISP1Verifier(verifier).verifyProof(txInclusionProgramVKey, _publicValues, _proofBytes);
        
        // Decode the public values
        PublicValuesStruct memory publicValues = abi.decode(_publicValues, (PublicValuesStruct));
        
        // Emit verification event
        emit TransactionInclusionVerified(
            publicValues.blockHash,
            publicValues.blockNumber,
            publicValues.transactionHash,
            publicValues.transactionIndex,
            publicValues.isIncluded
        );
        
        return (
            publicValues.blockHash,
            publicValues.blockNumber,
            publicValues.transactionHash,
            publicValues.transactionIndex,
            publicValues.isIncluded,
            publicValues.verifiedAgainstRoot
        );
    }

    /// @notice View function to verify transaction inclusion without state changes.
    /// @param _publicValues The encoded public values.
    /// @param _proofBytes The encoded proof.
    /// @return blockHash The hash of the block containing the transaction
    /// @return blockNumber The number of the block containing the transaction
    /// @return transactionHash The hash of the transaction being verified
    /// @return transactionIndex The index of the transaction within the block
    /// @return isIncluded Whether the transaction is included in the block
    /// @return verifiedAgainstRoot The merkle root that the proof was verified against
    function verifyTransactionInclusionView(bytes calldata _publicValues, bytes calldata _proofBytes)
        public
        view
        returns (
            bytes32 blockHash,
            uint64 blockNumber,
            bytes32 transactionHash,
            uint64 transactionIndex,
            bool isIncluded,
            bytes32 verifiedAgainstRoot
        )
    {
        // Verify the proof using SP1
        ISP1Verifier(verifier).verifyProof(txInclusionProgramVKey, _publicValues, _proofBytes);
        
        // Decode the public values
        PublicValuesStruct memory publicValues = abi.decode(_publicValues, (PublicValuesStruct));
        
        return (
            publicValues.blockHash,
            publicValues.blockNumber,
            publicValues.transactionHash,
            publicValues.transactionIndex,
            publicValues.isIncluded,
            publicValues.verifiedAgainstRoot
        );
    }

    /// @notice Update the verification key for the transaction inclusion program.
    /// @dev Only the owner can call this function.
    /// @param _newVKey The new verification key.
    function updateVerificationKey(bytes32 _newVKey) external onlyOwner {
        bytes32 oldVKey = txInclusionProgramVKey;
        txInclusionProgramVKey = _newVKey;
        emit VerificationKeyUpdated(oldVKey, _newVKey);
    }
}
