pragma solidity ^0.5.17;

import "./IArbitrable.sol";
import "../lib/os/ERC20.sol";
import "../payments/IPaymentsBook.sol";


interface IArbitrator {
    /**
    * @dev Emitted when new evidence is submitted for the IArbitrable instance's dispute
    * @param disputeId Identification number of the dispute receiving new evidence
    * @param submitter Address of the account submitting the evidence
    * @param evidence Data submitted for the evidence of the dispute
    */
    event EvidenceSubmitted(uint256 indexed disputeId, address indexed submitter, bytes evidence);

    /**
    * @dev Create a dispute over the Arbitrable sender with a number of possible rulings
    * @param _possibleRulings Number of possible rulings allowed for the dispute
    * @param _metadata Optional metadata that can be used to provide additional information on the dispute to be created
    * @return Dispute identification number
    */
    function createDispute(uint256 _possibleRulings, bytes calldata _metadata) external returns (uint256);

    /**
    * @dev Submit evidence for a dispute
    * @param _disputeId Id of the dispute in the Protocol
    * @param _submitter Address of the account submitting the evidence
    * @param _evidence Data submitted for the evidence related to the dispute
    */
    function submitEvidence(uint256 _disputeId, address _submitter, bytes calldata _evidence) external;

    /**
    * @dev Close the evidence period of a dispute
    * @param _disputeId Identification number of the dispute to close its evidence submitting period
    */
    function closeEvidencePeriod(uint256 _disputeId) external;

    /**
    * @notice Rule dispute #`_disputeId` if ready
    * @param _disputeId Identification number of the dispute to be ruled
    * @return subject Arbitrable instance associated to the dispute
    * @return ruling Ruling number computed for the given dispute
    */
    function rule(uint256 _disputeId) external returns (IArbitrable subject, uint256 ruling);

    /**
    * @dev Tell the dispute fees information to create a dispute
    * @return recipient Address where the corresponding dispute fees must be transferred to
    * @return feeToken ERC20 token used for the fees
    * @return feeAmount Total amount of fees that must be allowed to the recipient
    */
    function getDisputeFees() external view returns (address recipient, ERC20 feeToken, uint256 feeAmount);

    /**
    * @dev Tell the payments recipient address
    * @return Address of the payments recipient module
    */
    function getPaymentsRecipient() external view returns (address);
}
