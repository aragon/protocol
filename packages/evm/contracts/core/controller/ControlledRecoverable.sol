pragma solidity ^0.5.17;

import "../../lib/os/ERC20.sol";
import "../../lib/os/SafeERC20.sol";

import "./Controlled.sol";


contract ControlledRecoverable is Controlled {
    using SafeERC20 for ERC20;

    string private constant ERROR_SENDER_NOT_FUNDS_GOVERNOR = "CTD_SENDER_NOT_FUNDS_GOVERNOR";
    string private constant ERROR_INSUFFICIENT_RECOVER_FUNDS = "CTD_INSUFFICIENT_RECOVER_FUNDS";
    string private constant ERROR_RECOVER_TOKEN_FUNDS_FAILED = "CTD_RECOVER_TOKEN_FUNDS_FAILED";

    event RecoverFunds(address token, address recipient, uint256 balance);

    /**
    * @dev Ensure the msg.sender is the controller's funds governor
    */
    modifier onlyFundsGovernor {
        require(msg.sender == controller.getFundsGovernor(), ERROR_SENDER_NOT_FUNDS_GOVERNOR);
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
    * @notice Transfer all `_token` tokens to `_to`
    * @param _token Address of the token to be recovered
    * @param _to Address of the recipient that will be receive all the funds of the requested token
    */
    function recoverFunds(address _token, address payable _to) external payable onlyFundsGovernor {
        uint256 balance;

        if (_token == address(0)) {
            balance = address(this).balance;
            // solium-disable-next-line security/no-send
            require(_to.send(balance), ERROR_RECOVER_TOKEN_FUNDS_FAILED);
        } else {
            balance = ERC20(_token).balanceOf(address(this));
            require(balance > 0, ERROR_INSUFFICIENT_RECOVER_FUNDS);
            require(ERC20(_token).safeTransfer(_to, balance), ERROR_RECOVER_TOKEN_FUNDS_FAILED);
        }

        emit RecoverFunds(_token, _to, balance);
    }
}
