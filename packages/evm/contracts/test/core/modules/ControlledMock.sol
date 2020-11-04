pragma solidity ^0.5.17;

import "../../../core/modules/Controlled.sol";


contract ControlledMock is Controlled {
    event OnlyConfigGovernorCalled();

    constructor(Controller _controller) Controlled(_controller) public {}

    function onlyConfigGovernorFn() external onlyConfigGovernor {
        emit OnlyConfigGovernorCalled();
    }
}
