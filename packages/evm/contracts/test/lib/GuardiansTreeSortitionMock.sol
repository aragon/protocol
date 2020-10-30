pragma solidity ^0.5.17;

import "./HexSumTreeMock.sol";
import "../../lib/tree/GuardiansTreeSortition.sol";


contract GuardiansTreeSortitionMock is HexSumTreeMock {
    using GuardiansTreeSortition for HexSumTree.Tree;

    function batchedRandomSearch(
        bytes32 _termRandomness,
        uint256 _disputeId,
        uint64 _termId,
        uint256 _selectedGuardians,
        uint256 _batchRequestedGuardians,
        uint256 _roundRequestedGuardians,
        uint256 _sortitionIteration
    )
        public
        view
        returns (uint256[] memory guardiansIds, uint256[] memory activeBalances)
    {
        return tree.batchedRandomSearch(_termRandomness, _disputeId, _termId, _selectedGuardians, _batchRequestedGuardians, _roundRequestedGuardians, _sortitionIteration);
    }

    function getSearchBatchBounds(uint64 _termId, uint256 _selectedGuardians, uint256 _batchRequestedGuardians, uint256 _roundRequestedGuardians)
        public
        view
        returns (uint256 low, uint256 high)
    {
        return tree.getSearchBatchBounds(_termId, _selectedGuardians, _batchRequestedGuardians, _roundRequestedGuardians);
    }

    function computeSearchRandomBalances(
        bytes32 _termRandomness,
        uint256 _disputeId,
        uint256 _sortitionIteration,
        uint256 _batchRequestedGuardians,
        uint256 _lowActiveBalanceBatchBound,
        uint256 _highActiveBalanceBatchBound
    )
        public
        pure
        returns (uint256[] memory)
    {
        return GuardiansTreeSortition._computeSearchRandomBalances(_termRandomness, _disputeId, _sortitionIteration, _batchRequestedGuardians, _lowActiveBalanceBatchBound, _highActiveBalanceBatchBound);
    }
}
