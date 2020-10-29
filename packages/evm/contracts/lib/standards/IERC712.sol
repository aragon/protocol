pragma solidity ^0.5.17;


interface IERC712 {
    /**
    * @dev Get EIP712 domain separator
    */
    function getDomainSeparator() external view returns (bytes32);
}
