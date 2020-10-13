pragma solidity ^0.5.8;

import "../../lib/os/IsContract.sol";

import "./Modules.sol";
import "./IModuleCache.sol";
import "./Controller.sol";
import "../clock/IClock.sol";
import "../config/ConfigConsumer.sol";
import "../../voting/ICRVoting.sol";
import "../../treasury/ITreasury.sol";
import "../../registry/IJurorsRegistry.sol";
import "../../disputes/IDisputeManager.sol";
import "../../subscriptions/ISubscriptions.sol";


contract Controlled is IsContract, IModuleCache, Modules, ConfigConsumer {
    string private constant ERROR_MODULE_NOT_SET = "CTD_MODULE_NOT_SET";
    string private constant ERROR_CONTROLLER_NOT_CONTRACT = "CTD_CONTROLLER_NOT_CONTRACT";
    string private constant ERROR_SENDER_NOT_ALLOWED = "CTD_SENDER_NOT_ALLOWED";
    string private constant ERROR_SENDER_NOT_CONTROLLER = "CTD_SENDER_NOT_CONTROLLER";
    string private constant ERROR_SENDER_NOT_CONFIG_GOVERNOR = "CTD_SENDER_NOT_CONFIG_GOVERNOR";
    string private constant ERROR_SENDER_NOT_DISPUTES_MODULE = "CTD_SENDER_NOT_DISPUTES_MODULE";

    // Address of the controller
    Controller internal controller;

    // List of module caches indexed by ID
    mapping (bytes32 => address) internal modulesCache;

    event ModuleCached(bytes32 id, address addr);

    /**
    * @dev Ensure the msg.sender is the controller's config governor
    */
    modifier onlyConfigGovernor {
        require(msg.sender == _configGovernor(), ERROR_SENDER_NOT_CONFIG_GOVERNOR);
        _;
    }

    /**
    * @dev Ensure the msg.sender is the controller
    */
    modifier onlyController() {
        require(msg.sender == address(controller), ERROR_SENDER_NOT_CONTROLLER);
        _;
    }

    /**
    * @dev Ensure the msg.sender is the DisputeManager module
    */
    modifier onlyDisputeManager() {
        require(msg.sender == address(_disputeManager()), ERROR_SENDER_NOT_DISPUTES_MODULE);
        _;
    }

    /**
    * @dev Constructor function
    * @param _controller Address of the controller
    */
    constructor(Controller _controller) public {
        require(isContract(address(_controller)), ERROR_CONTROLLER_NOT_CONTRACT);
        controller = _controller;
    }

    /**
    * @notice Update the implementation cache of the module `_id` to `_addr`
    * @param _id ID of the module to be updated
    * @param _addr Module address to be updated
    */
    function cacheModule(bytes32 _id, address _addr) external {
        require(msg.sender == address(controller) || msg.sender == _modulesGovernor(), ERROR_SENDER_NOT_ALLOWED);

        modulesCache[_id] = _addr;
        emit ModuleCached(_id, _addr);
    }

    /**
    * @dev Tell the address of the controller
    * @return Address of the controller
    */
    function getController() external view returns (Controller) {
        return controller;
    }

    /**
    * @dev Internal function to ensure the Court term is up-to-date, it will try to update it if not
    * @return Identification number of the current Court term
    */
    function _ensureCurrentTerm() internal returns (uint64) {
        return _clock().ensureCurrentTerm();
    }

    /**
    * @dev Internal function to fetch the last ensured term ID of the Court
    * @return Identification number of the last ensured term
    */
    function _getLastEnsuredTermId() internal view returns (uint64) {
        return _clock().getLastEnsuredTermId();
    }

    /**
    * @dev Internal function to tell the current term identification number
    * @return Identification number of the current term
    */
    function _getCurrentTermId() internal view returns (uint64) {
        return _clock().getCurrentTermId();
    }

    /**
    * @dev Internal function to fetch the controller's config governor
    * @return Address of the controller's config governor
    */
    function _configGovernor() internal view returns (address) {
        return controller.getConfigGovernor();
    }

    /**
    * @dev Internal function to fetch the controller's modules governor
    * @return Address of the controller's modules governor
    */
    function _modulesGovernor() internal view returns (address) {
        return controller.getModulesGovernor();
    }

    /**
    * @dev Internal function to fetch the address of the DisputeManager module
    * @return Address of the DisputeManager module
    */
    function _disputeManager() internal view returns (IDisputeManager) {
        return IDisputeManager(_getModuleCache(DISPUTE_MANAGER));
    }

    /**
    * @dev Internal function to fetch the address of the Treasury module implementation
    * @return Address of the Treasury module implementation
    */
    function _treasury() internal view returns (ITreasury) {
        return ITreasury(_getModuleCache(TREASURY));
    }

    /**
    * @dev Internal function to fetch the address of the Voting module implementation
    * @return Address of the Voting module implementation
    */
    function _voting() internal view returns (ICRVoting) {
        return ICRVoting(_getModuleCache(VOTING));
    }

    /**
    * @dev Internal function to fetch the address of the Voting module owner
    * @return Address of the Voting module owner
    */
    function _votingOwner() internal view returns (ICRVotingOwner) {
        return ICRVotingOwner(_getModuleCache(DISPUTE_MANAGER));
    }

    /**
    * @dev Internal function to fetch the address of the JurorRegistry module implementation
    * @return Address of the JurorRegistry module implementation
    */
    function _jurorsRegistry() internal view returns (IJurorsRegistry) {
        return IJurorsRegistry(_getModuleCache(JURORS_REGISTRY));
    }

    /**
    * @dev Internal function to fetch the address of the Subscriptions module implementation
    * @return Address of the Subscriptions module implementation
    */
    function _subscriptions() internal view returns (ISubscriptions) {
        return ISubscriptions(_getModuleCache(SUBSCRIPTIONS));
    }

    /**
    * @dev Internal function to tell the address cached for a module based on a given ID
    * @param _id ID of the module being queried
    * @return Cached address of the requested module
    */
    function _getModuleCache(bytes32 _id) internal view returns (address) {
        address module = modulesCache[_id];
        require(module != address(0), ERROR_MODULE_NOT_SET);
        return module;
    }

    /**
    * @dev Internal function to fetch the address of the Clock module from the controller
    * @return Address of the Clock module
    */
    function _clock() internal view returns (IClock) {
        return IClock(controller);
    }

    /**
    * @dev Internal function to fetch the address of the Config module from the controller
    * @return Address of the Config module
    */
    function _courtConfig() internal view returns (IConfig) {
        return IConfig(controller);
    }
}
