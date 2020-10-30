pragma solidity ^0.5.17;

import "../../arbitration/IArbitrable.sol";
import "../../arbitration/IArbitrator.sol";


contract ArbitrableMock is IArbitrable {
    IArbitrator internal arbitrator;

    constructor (IArbitrator _arbitrator) public {
        arbitrator = _arbitrator;
    }

    function createDispute(uint8 _possibleRulings, bytes calldata _metadata) external {
        (address recipient, IERC20 feeToken, uint256 disputeFees) = arbitrator.getDisputeFees();
        feeToken.approve(recipient, disputeFees);
        arbitrator.createDispute(_possibleRulings, _metadata);
    }

    function submitEvidence(uint256 _disputeId, bytes calldata _evidence, bool _finished) external {
        arbitrator.submitEvidence(_disputeId, msg.sender, _evidence);
        if (_finished) arbitrator.closeEvidencePeriod(_disputeId);
    }

    function submitEvidenceFor(uint256 _disputeId, address _submitter, bytes calldata _evidence, bool _finished) external {
        arbitrator.submitEvidence(_disputeId, _submitter, _evidence);
        if (_finished) arbitrator.closeEvidencePeriod(_disputeId);
    }

    function rule(uint256 _disputeId) external {
        (, uint256 ruling) = arbitrator.rule(_disputeId);
        emit Ruled(arbitrator, _disputeId, ruling);
    }
}
