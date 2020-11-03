pragma solidity ^0.5.17;

import "../../lib/utils/SafeERC20.sol";
import "../../lib/standards/IERC20.sol";

import "./Controlled.sol";


contract ControlledRelayable is Controlled {
    string private constant ERROR_SENDER_NOT_ALLOWED = "CTD_SENDER_NOT_ALLOWED";

    modifier authenticate(address _user) {
        require(_isSenderAllowed(_user), ERROR_SENDER_NOT_ALLOWED);
        _;
    }

    /**
    * @dev Constructor function
    * @param _controller Address of the controller
    */
    constructor(Controller _controller) Controlled(_controller) public {
        // solium-disable-previous-line no-empty-blocks
    }

    /**
    * @dev Tell whether a sender is allowed or not
    * @return True if the sender is allowed, false otherwise
    */
    function _isSenderAllowed(address _user) internal view returns (bool) {
        return msg.sender == _user || controller.isRelayerWhitelisted(msg.sender);
    }
}
