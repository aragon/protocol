pragma solidity ^0.5.17;

import "../../lib/TimeHelpersMock.sol";
import "../../../core/modules/SignaturesValidator.sol";


contract SignaturesValidatorMock is SignaturesValidator, TimeHelpersMock {
    event Authenticated(address user, address sender);
    event CalldataDecoded(bytes data, uint256 deadline, bytes32 r, bytes32 s, uint8 v);

    function decodeCalldata() external {
        (bytes memory data, uint256 deadline, bytes32 r, bytes32 s, uint8 v) = _decodeCalldata();
        emit CalldataDecoded(data, deadline, r, s, v);
    }

    function authenticateCall(address _user) external authenticate(_user) {
        (bytes memory data, uint256 deadline, bytes32 r, bytes32 s, uint8 v) = _decodeCalldata();
        emit CalldataDecoded(data, deadline, r, s, v);
        emit Authenticated(_user, msg.sender);
    }

    function anotherFunction(address _user) external {
        // do nothing
    }

    function increaseNonce(address _user) external {
        nextNonce[_user]++;
    }
}
