pragma solidity ^0.5.8;


interface IModuleCache {

    /**
    * @notice Update the implementation cache of the module `_id` to `_addr`
    * @param _id ID of the module to be updated
    * @param _addr Module address to be updated
    */
    function cacheModule(bytes32 _id, address _addr) external;
}
