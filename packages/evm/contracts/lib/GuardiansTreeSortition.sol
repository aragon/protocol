pragma solidity ^0.5.17;

import "../lib/os/SafeMath.sol";

import "./HexSumTree.sol";


/**
* @title GuardiansTreeSortition - Library to perform guardians sortition over a `HexSumTree`
*/
library GuardiansTreeSortition {
    using SafeMath for uint256;
    using HexSumTree for HexSumTree.Tree;

    string private constant ERROR_INVALID_INTERVAL_SEARCH = "TREE_INVALID_INTERVAL_SEARCH";
    string private constant ERROR_SORTITION_LENGTHS_MISMATCH = "TREE_SORTITION_LENGTHS_MISMATCH";

    /**
    * @dev Search random items in the tree based on certain restrictions
    * @param _termRandomness Randomness to compute the seed for the draft
    * @param _disputeId Identification number of the dispute to draft guardians for
    * @param _termId Current term when the draft is being computed
    * @param _selectedGuardians Number of guardians already selected for the draft
    * @param _batchRequestedGuardians Number of guardians to be selected in the given batch of the draft
    * @param _roundRequestedGuardians Total number of guardians requested to be drafted
    * @param _sortitionIteration Number of sortitions already performed for the given draft
    * @return guardiansIds List of guardian ids obtained based on the requested search
    * @return guardiansBalances List of active balances for each guardian obtained based on the requested search
    */
    function batchedRandomSearch(
        HexSumTree.Tree storage tree,
        bytes32 _termRandomness,
        uint256 _disputeId,
        uint64 _termId,
        uint256 _selectedGuardians,
        uint256 _batchRequestedGuardians,
        uint256 _roundRequestedGuardians,
        uint256 _sortitionIteration
    )
        internal
        view
        returns (uint256[] memory guardiansIds, uint256[] memory guardiansBalances)
    {
        (uint256 low, uint256 high) = getSearchBatchBounds(
            tree,
            _termId,
            _selectedGuardians,
            _batchRequestedGuardians,
            _roundRequestedGuardians
        );

        uint256[] memory balances = _computeSearchRandomBalances(
            _termRandomness,
            _disputeId,
            _sortitionIteration,
            _batchRequestedGuardians,
            low,
            high
        );

        (guardiansIds, guardiansBalances) = tree.search(balances, _termId);

        require(guardiansIds.length == guardiansBalances.length, ERROR_SORTITION_LENGTHS_MISMATCH);
        require(guardiansIds.length == _batchRequestedGuardians, ERROR_SORTITION_LENGTHS_MISMATCH);
    }

    /**
    * @dev Get the bounds for a draft batch based on the active balances of the guardians
    * @param _termId Term ID of the active balances that will be used to compute the boundaries
    * @param _selectedGuardians Number of guardians already selected for the draft
    * @param _batchRequestedGuardians Number of guardians to be selected in the given batch of the draft
    * @param _roundRequestedGuardians Total number of guardians requested to be drafted
    * @return low Low bound to be used for the sortition to draft the requested number of guardians for the given batch
    * @return high High bound to be used for the sortition to draft the requested number of guardians for the given batch
    */
    function getSearchBatchBounds(
        HexSumTree.Tree storage tree,
        uint64 _termId,
        uint256 _selectedGuardians,
        uint256 _batchRequestedGuardians,
        uint256 _roundRequestedGuardians
    )
        internal
        view
        returns (uint256 low, uint256 high)
    {
        uint256 totalActiveBalance = tree.getRecentTotalAt(_termId);
        low = _selectedGuardians.mul(totalActiveBalance).div(_roundRequestedGuardians);

        uint256 newSelectedGuardians = _selectedGuardians.add(_batchRequestedGuardians);
        high = newSelectedGuardians.mul(totalActiveBalance).div(_roundRequestedGuardians);
    }

    /**
    * @dev Get a random list of active balances to be searched in the guardians tree for a given draft batch
    * @param _termRandomness Randomness to compute the seed for the draft
    * @param _disputeId Identification number of the dispute to draft guardians for (for randomness)
    * @param _sortitionIteration Number of sortitions already performed for the given draft (for randomness)
    * @param _batchRequestedGuardians Number of guardians to be selected in the given batch of the draft
    * @param _lowBatchBound Low bound to be used for the sortition batch to draft the requested number of guardians
    * @param _highBatchBound High bound to be used for the sortition batch to draft the requested number of guardians
    * @return Random list of active balances to be searched in the guardians tree for the given draft batch
    */
    function _computeSearchRandomBalances(
        bytes32 _termRandomness,
        uint256 _disputeId,
        uint256 _sortitionIteration,
        uint256 _batchRequestedGuardians,
        uint256 _lowBatchBound,
        uint256 _highBatchBound
    )
        internal
        pure
        returns (uint256[] memory)
    {
        // Calculate the interval to be used to search the balances in the tree. Since we are using a modulo function to compute the
        // random balances to be searched, intervals will be closed on the left and open on the right, for example [0,10).
        require(_highBatchBound > _lowBatchBound, ERROR_INVALID_INTERVAL_SEARCH);
        uint256 interval = _highBatchBound - _lowBatchBound;

        // Compute an ordered list of random active balance to be searched in the guardians tree
        uint256[] memory balances = new uint256[](_batchRequestedGuardians);
        for (uint256 batchGuardianNumber = 0; batchGuardianNumber < _batchRequestedGuardians; batchGuardianNumber++) {
            // Compute a random seed using:
            // - The inherent randomness associated to the term from blockhash
            // - The disputeId, so 2 disputes in the same term will have different outcomes
            // - The sortition iteration, to avoid getting stuck if resulting guardians are dismissed due to locked balance
            // - The guardian number in this batch
            bytes32 seed = keccak256(abi.encodePacked(_termRandomness, _disputeId, _sortitionIteration, batchGuardianNumber));

            // Compute a random active balance to be searched in the guardians tree using the generated seed within the
            // boundaries computed for the current batch.
            balances[batchGuardianNumber] = _lowBatchBound.add(uint256(seed) % interval);

            // Make sure it's ordered, flip values if necessary
            for (uint256 i = batchGuardianNumber; i > 0 && balances[i] < balances[i - 1]; i--) {
                uint256 tmp = balances[i - 1];
                balances[i - 1] = balances[i];
                balances[i] = tmp;
            }
        }
        return balances;
    }
}
