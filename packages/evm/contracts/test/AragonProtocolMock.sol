pragma solidity ^0.5.8;

import "../AragonProtocol.sol";
import "./lib/TimeHelpersMock.sol";


contract AragonProtocolMock is AragonProtocol, TimeHelpersMock {
    uint64 internal mockedTermId;
    bytes32 internal mockedTermRandomness;

    constructor(
        uint64[2] memory _termParams,
        address[3] memory _governors,
        ERC20 _feeToken,
        uint256[3] memory _fees,
        uint64[5] memory _roundStateDurations,
        uint16[2] memory _pcts,
        uint64[4] memory _roundParams,
        uint256[2] memory _appealCollateralParams,
        uint256 _minActiveBalance
    )
        AragonProtocol(
            _termParams,
            _governors,
            _feeToken,
            _fees,
            _roundStateDurations,
            _pcts,
            _roundParams,
            _appealCollateralParams,
            _minActiveBalance
        )
        public
    {}

    function setDisputeManager(address _addr) external {
        _setAndCacheModule(DISPUTE_MANAGER, _addr);
    }

    function setDisputeManagerMock(address _addr) external {
        // This function allows setting any address as the DisputeManager module
        currentModules[DISPUTE_MANAGER] = _addr;
        allModules[_addr].id = DISPUTE_MANAGER;
        emit ModuleSet(DISPUTE_MANAGER, _addr);
    }

    function setTreasury(address _addr) external {
        _setAndCacheModule(TREASURY, _addr);
    }

    function setVoting(address _addr) external {
        _setAndCacheModule(VOTING, _addr);
    }

    function setGuardiansRegistry(address _addr) external {
        _setAndCacheModule(GUARDIANS_REGISTRY, _addr);
    }

    function setPaymentsBook(address _addr) external {
        _setAndCacheModule(PAYMENTS_BOOK, _addr);
    }

    function mockIncreaseTerm() external {
        if (mockedTermId != 0) mockedTermId = mockedTermId + 1;
        else mockedTermId = _lastEnsuredTermId() + 1;
    }

    function mockIncreaseTerms(uint64 _terms) external {
        if (mockedTermId != 0) mockedTermId = mockedTermId + _terms;
        else mockedTermId = _lastEnsuredTermId() + _terms;
    }

    function mockSetTerm(uint64 _termId) external {
        mockedTermId = _termId;
    }

    function mockSetTermRandomness(bytes32 _termRandomness) external {
        mockedTermRandomness = _termRandomness;
    }

    function ensureCurrentTerm() external returns (uint64) {
        if (mockedTermId != 0) return mockedTermId;
        return super._ensureCurrentTerm();
    }

    function getCurrentTermId() external view returns (uint64) {
        if (mockedTermId != 0) return mockedTermId;
        return super._currentTermId();
    }

    function getLastEnsuredTermId() external view returns (uint64) {
        if (mockedTermId != 0) return mockedTermId;
        return super._lastEnsuredTermId();
    }

    function getTermRandomness(uint64 _termId) external view returns (bytes32) {
        if (mockedTermRandomness != bytes32(0)) return mockedTermRandomness;
        return super._computeTermRandomness(_termId);
    }

    function _computeTermRandomness(uint64 _termId) internal view returns (bytes32) {
        if (mockedTermRandomness != bytes32(0)) return mockedTermRandomness;
        return super._computeTermRandomness(_termId);
    }

    function _setAndCacheModule(bytes32 _id, address _addr) private {
        _setModule(_id, _addr);

        bytes32[] memory ids = new bytes32[](5);
        ids[0] = DISPUTE_MANAGER;
        ids[1] = VOTING;
        ids[2] = TREASURY;
        ids[3] = GUARDIANS_REGISTRY;
        ids[4] = PAYMENTS_BOOK;

        address[] memory addresses = new address[](5);
        for (uint i = 0; i < ids.length; i++) {
            addresses[i] = currentModules[ids[i]];
        }

        for (uint j = 0; j < addresses.length; j++) {
            IModuleCache(addresses[j]).cacheModules(ids, addresses);
        }
    }
}
