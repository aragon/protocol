pragma solidity ^0.5.17;

import "../../lib/TimeHelpersMock.sol";
import "../../../core/modules/SignaturesValidator.sol";


contract SignaturesValidatorMock is SignaturesValidator, TimeHelpersMock {
    event Authenticated(address user, address sender);
    event CalldataDecoded(bytes data, uint256 deadline, uint8 v, bytes32 r, bytes32 s);

    function decodeCalldata() external {
        _decodeCalldata();
    }

    function authenticateCall(address _user) external authenticate(_user) {
        _decodeCalldata();
        emit Authenticated(_user, msg.sender);
    }

    function anotherFunction(address _user) external {
        // do nothing
    }

    function increaseNonce(address _user) external {
        nextNonce[_user]++;
    }

    function _decodeCalldata() internal {
        (uint8 v, bytes32 r, bytes32 s) = _signature();
        emit CalldataDecoded(_calldata(), _deadline(), v, r, s);
    }
}
