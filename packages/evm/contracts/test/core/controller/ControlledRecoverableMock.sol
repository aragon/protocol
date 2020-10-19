pragma solidity ^0.5.17;

import "../../../core/controller/ControlledRecoverable.sol";


contract ControlledRecoverableMock is ControlledRecoverable {
    event EtherReceived(address sender, uint256 value);

    constructor(Controller _controller) ControlledRecoverable(_controller) public {}

    function receiveEther() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }
}
