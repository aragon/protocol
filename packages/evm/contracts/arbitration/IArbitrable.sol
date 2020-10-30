pragma solidity ^0.5.17;

import "./IArbitrator.sol";


contract IArbitrable {
    /**
    * @dev Emitted when an IArbitrable instance's dispute is ruled by an IArbitrator
    * @param arbitrator IArbitrator instance ruling the dispute
    * @param disputeId Identification number of the dispute being ruled by the arbitrator
    * @param ruling Ruling given by the arbitrator
    */
    event Ruled(IArbitrator indexed arbitrator, uint256 indexed disputeId, uint256 ruling);

    /**
    * @dev Give a ruling for a certain dispute
    * @param _disputeId Identification number of the dispute to be ruled
    */
    function rule(uint256 _disputeId) external;
}
