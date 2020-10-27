pragma solidity ^0.5.17;

import "../../registry/ILockManager.sol";
import "../../registry/GuardiansRegistry.sol";


contract LockManagerMock is ILockManager, ApproveAndCallFallBack {
    string private constant ERROR_INVALID_TOKEN = "LM_INVALID_TOKEN";
    string private constant ERROR_TOKEN_DEPOSIT_FAILED = "LM_TOKEN_DEPOSIT_FAILED";

    bool internal canUnlockMock;
    GuardiansRegistry public registry;

    constructor(GuardiansRegistry _registry) public {
        registry = _registry;
    }

    function unlock(address _user, uint256 _amount) external {
        registry.unlockActivation(_user, address(this), _amount, false);
    }

    function receiveApproval(address _from, uint256 _amount, address _token, bytes calldata /* _data */) external {
        address token = registry.token();
        require(_token == token, ERROR_INVALID_TOKEN);

        require(ERC20(token).transferFrom(_from, address(this), _amount), ERROR_TOKEN_DEPOSIT_FAILED);

        bytes memory data = abi.encodePacked(GuardiansRegistry(registry).lockActivation.selector);
        registry.stakeFor(_from, _amount, data);
    }

    function mockCanUnlock(bool _canUnlock) external {
        canUnlockMock = _canUnlock;
    }

    function canUnlock(address /* _user */, uint256 /* _amount */) external view returns (bool) {
        return canUnlockMock;
    }
}
