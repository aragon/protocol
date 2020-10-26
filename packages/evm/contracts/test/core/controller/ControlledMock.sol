pragma solidity ^0.5.17;

import "../../../core/modules/Controlled.sol";


contract ControlledMock is Controlled {
    event OnlyConfigGovernorCalled();
    event EtherReceived(address sender, uint256 value);

    uint256 public counter;

    constructor(Controller _controller) Controlled(_controller) public {}

    function onlyConfigGovernorFn() external onlyConfigGovernor {
        emit OnlyConfigGovernorCalled();
    }

    function setCounter(uint256 _counter) external {
        counter = _counter;
    }

    function receiveEther() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    function fail() external pure {
        revert('CONTROLLED_FAIL');
    }
}
