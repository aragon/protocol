pragma solidity ^0.5.17;

import "../../lib/utils/SafeERC20.sol";
import "../../lib/standards/IERC20.sol";

import "./Controlled.sol";


contract ControlledRelayable is Controlled {
    string private constant ERROR_SENDER_NOT_ALLOWED = "CTD_SENDER_NOT_ALLOWED";

    /**
    * @dev Modifier for modules to support relayed transactions.
    *      This modifier will check that the sender is the user to act on behalf of or a whitelisted relayer.
    * @param _user Address of the user to act on behalf of
    */
    modifier authenticateSender(address _user) {
        _authenticateSender(_user);
        _;
    }

    /**
    * @dev Ensure that the sender is the user to act on behalf of or a whitelisted relayer
    * @param _user Address of the user to act on behalf of
    */
    function _authenticateSender(address _user) internal view {
        require(_isSenderAllowed(_user), ERROR_SENDER_NOT_ALLOWED);
    }

    /**
    * @dev Tell whether the sender is the user to act on behalf of or a whitelisted relayer
    * @return True if the sender is allowed, false otherwise
    */
    function _isSenderAllowed(address _user) internal view returns (bool) {
        return msg.sender == _user || controller.isRelayerWhitelisted(msg.sender);
    }
}
