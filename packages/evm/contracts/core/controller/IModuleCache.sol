pragma solidity ^0.5.17;


interface IModuleCache {

    /**
    * @notice Update the implementations cache of a list of modules
    * @param _ids List of IDs of the modules to be updated
    * @param _addresses List of module addresses to be updated
    */
    function cacheModules(bytes32[] calldata _ids, address[] calldata _addresses) external;
}
