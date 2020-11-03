pragma solidity ^0.5.17;

import "../../../core/modules/ControlledRelayable.sol";


contract RelayedMock is ControlledRelayable {
    event Authenticated(address user, address sender);

    constructor(Controller _controller) ControlledRelayable(_controller) public {}

    function authenticateCall(address _user) external authenticateSender(_user) {
        emit Authenticated(_user, msg.sender);
    }

    function anotherFunction(address _user) external {
        // do nothing
    }
}
