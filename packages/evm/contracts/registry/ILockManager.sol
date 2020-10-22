pragma solidity ^0.5.17;

import "../lib/os/ERC20.sol";


interface ILockManager {
    /**
    * @dev Tell whether a user can unlock a certain amount of tokens
    */
    function canUnlock(address user, uint256 amount) external returns (bool);
}
