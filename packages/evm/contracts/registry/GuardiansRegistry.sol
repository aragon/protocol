pragma solidity ^0.5.17;

import "../lib/os/SafeERC20.sol";
import "../lib/os/ERC20.sol";
import "../lib/os/SafeMath.sol";

import "./IGuardiansRegistry.sol";
import "./ILockManager.sol";
import "../lib/BytesHelpers.sol";
import "../lib/HexSumTree.sol";
import "../lib/PctHelpers.sol";
import "../lib/GuardiansTreeSortition.sol";
import "../standards/ERC900.sol";
import "../standards/ApproveAndCall.sol";
import "../core/controller/Controller.sol";
import "../core/controller/ControlledRecoverable.sol";


contract GuardiansRegistry is ControlledRecoverable, IGuardiansRegistry, ERC900, ApproveAndCallFallBack {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using PctHelpers for uint256;
    using BytesHelpers for bytes;
    using HexSumTree for HexSumTree.Tree;
    using GuardiansTreeSortition for HexSumTree.Tree;

    string private constant ERROR_NOT_CONTRACT = "GR_NOT_CONTRACT";
    string private constant ERROR_INVALID_ZERO_AMOUNT = "GR_INVALID_ZERO_AMOUNT";
    string private constant ERROR_INVALID_ACTIVATION_AMOUNT = "GR_INVALID_ACTIVATION_AMOUNT";
    string private constant ERROR_INVALID_DEACTIVATION_AMOUNT = "GR_INVALID_DEACTIVATION_AMOUNT";
    string private constant ERROR_INVALID_LOCKED_AMOUNTS_LENGTH = "GR_INVALID_LOCKED_AMOUNTS_LEN";
    string private constant ERROR_INVALID_REWARDED_GUARDIANS_LENGTH = "GR_INVALID_REWARDED_GUARDIANS_LEN";
    string private constant ERROR_ACTIVE_BALANCE_BELOW_MIN = "GR_ACTIVE_BALANCE_BELOW_MIN";
    string private constant ERROR_NOT_ENOUGH_AVAILABLE_BALANCE = "GR_NOT_ENOUGH_AVAILABLE_BALANCE";
    string private constant ERROR_CANNOT_REDUCE_DEACTIVATION_REQUEST = "GR_CANT_REDUCE_DEACTIVATION_REQ";
    string private constant ERROR_TOKEN_TRANSFER_FAILED = "GR_TOKEN_TRANSFER_FAILED";
    string private constant ERROR_TOKEN_APPROVE_NOT_ALLOWED = "GR_TOKEN_APPROVE_NOT_ALLOWED";
    string private constant ERROR_BAD_TOTAL_ACTIVE_BALANCE_LIMIT = "GR_BAD_TOTAL_ACTIVE_BAL_LIMIT";
    string private constant ERROR_TOTAL_ACTIVE_BALANCE_EXCEEDED = "GR_TOTAL_ACTIVE_BALANCE_EXCEEDED";
    string private constant ERROR_DEACTIVATION_AMOUNT_EXCEEDS_LOCK = "GR_DEACTIV_AMOUNT_EXCEEDS_LOCK";
    string private constant ERROR_CANNOT_UNLOCK_ACTIVATION = "GR_CANNOT_UNLOCK_ACTIVATION";
    string private constant ERROR_LOCK_MANAGER_NOT_ALLOWED = "GR_LOCK_MANAGER_NOT_ALLOWED";
    string private constant ERROR_ZERO_LOCK_ACTIVATION = "GR_ZERO_LOCK_ACTIVATION";
    string private constant ERROR_INVALID_UNLOCK_ACTIVATION_AMOUNT = "GR_INVALID_UNLOCK_ACTIVAT_AMOUNT";
    string private constant ERROR_WITHDRAWALS_LOCK = "GR_WITHDRAWALS_LOCK";

    // Address that will be used to burn guardian tokens
    address internal constant BURN_ACCOUNT = address(0x000000000000000000000000000000000000dEaD);

    // Address to be used for permissions configuration
    address internal constant ANY_ENTITY = address(-1);

    // Maximum number of sortition iterations allowed per draft call
    uint256 internal constant MAX_DRAFT_ITERATIONS = 10;

    /**
    * @dev Guardians have three kind of balances, these are:
    *      - active: tokens activated for the Protocol that can be locked in case the guardian is drafted
    *      - locked: amount of active tokens that are locked for a draft
    *      - available: tokens that are not activated for the Protocol and can be withdrawn by the guardian at any time
    *
    *      Due to a gas optimization for drafting, the "active" tokens are stored in a `HexSumTree`, while the others
    *      are stored in this contract as `lockedBalance` and `availableBalance` respectively. Given that the guardians'
    *      active balances cannot be affected during the current Protocol term, if guardians want to deactivate some of
    *      their active tokens, their balance will be updated for the following term, and they won't be allowed to
    *      withdraw them until the current term has ended.
    *
    *      Note that even though guardians balances are stored separately, all the balances are held by this contract.
    */
    struct Guardian {
        uint256 id;                                 // Key in the guardians tree used for drafting
        uint256 lockedBalance;                      // Maximum amount of tokens that can be slashed based on the guardian's drafts
        uint256 availableBalance;                   // Available tokens that can be withdrawn at any time
        uint64 withdrawalsLockTermId;               // Term ID until which the guardian's withdrawals will be locked
        ActivationLocks activationLocks;            // Guardian's activation locks
        DeactivationRequest deactivationRequest;    // Guardian's pending deactivation request
    }

    /**
    * @dev Guardians can define lock managers to control their minimum active balance in the registry
    */
    struct ActivationLocks {
        uint256 total;                               // Total amount of active balance locked
        mapping (address => uint256) lockedBy;       // List of locked amounts indexed by lock manager
    }

    /**
    * @dev Given that the guardians balances cannot be affected during a Protocol term, if guardians want to deactivate some
    *      of their tokens, the tree will always be updated for the following term, and they won't be able to
    *      withdraw the requested amount until the current term has finished. Thus, we need to keep track the term
    *      when a token deactivation was requested and its corresponding amount.
    */
    struct DeactivationRequest {
        uint256 amount;                             // Amount requested for deactivation
        uint64 availableTermId;                     // Term ID when guardians can withdraw their requested deactivation tokens
    }

    /**
    * @dev Internal struct to wrap all the params required to perform guardians drafting
    */
    struct DraftParams {
        bytes32 termRandomness;                     // Randomness seed to be used for the draft
        uint256 disputeId;                          // ID of the dispute being drafted
        uint64 termId;                              // Term ID of the dispute's draft term
        uint256 selectedGuardians;                  // Number of guardians already selected for the draft
        uint256 batchRequestedGuardians;            // Number of guardians to be selected in the given batch of the draft
        uint256 roundRequestedGuardians;            // Total number of guardians requested to be drafted
        uint256 draftLockAmount;                    // Amount of tokens to be locked to each drafted guardian
        uint256 iteration;                          // Sortition iteration number
    }

    // Maximum amount of total active balance that can be held in the registry
    uint256 internal totalActiveBalanceLimit;

    // Guardian ERC20 token
    ERC20 internal guardiansToken;

    // Mapping of guardian data indexed by address
    mapping (address => Guardian) internal guardiansByAddress;

    // Mapping of guardian addresses indexed by id
    mapping (uint256 => address) internal guardiansAddressById;

    // Mapping of whitelisted lock managers indexed by address
    mapping (address => bool) internal whitelistedLockManagers;

    // Tree to store guardians active balance by term for the drafting process
    HexSumTree.Tree internal tree;

    event GuardianActivated(address indexed guardian, uint64 fromTermId, uint256 amount, address sender);
    event GuardianDeactivationRequested(address indexed guardian, uint64 availableTermId, uint256 amount);
    event GuardianDeactivationProcessed(address indexed guardian, uint64 availableTermId, uint256 amount, uint64 processedTermId);
    event GuardianDeactivationUpdated(address indexed guardian, uint64 availableTermId, uint256 amount, uint64 updateTermId);
    event GuardianActivationLockChanged(address indexed guardian, address indexed lockManager, uint256 amount, uint256 total);
    event GuardianBalanceLocked(address indexed guardian, uint256 amount);
    event GuardianBalanceUnlocked(address indexed guardian, uint256 amount);
    event GuardianSlashed(address indexed guardian, uint256 amount, uint64 effectiveTermId);
    event GuardianTokensAssigned(address indexed guardian, uint256 amount);
    event GuardianTokensBurned(uint256 amount);
    event GuardianTokensCollected(address indexed guardian, uint256 amount, uint64 effectiveTermId);
    event TotalActiveBalanceLimitChanged(uint256 previousTotalActiveBalanceLimit, uint256 currentTotalActiveBalanceLimit);
    event LockManagerWhitelistChanged(address indexed lockManager, bool allowed);

    /**
    * @dev Constructor function
    * @param _controller Address of the controller
    * @param _guardianToken Address of the ERC20 token to be used as guardian token for the registry
    * @param _totalActiveBalanceLimit Maximum amount of total active balance that can be held in the registry
    */
    constructor(Controller _controller, ERC20 _guardianToken, uint256 _totalActiveBalanceLimit)
        ControlledRecoverable(_controller)
        public
    {
        // No need to explicitly call `Controlled` constructor since `ControlledRecoverable` is already doing it
        require(isContract(address(_guardianToken)), ERROR_NOT_CONTRACT);

        guardiansToken = _guardianToken;
        _setTotalActiveBalanceLimit(_totalActiveBalanceLimit);

        tree.init();
        // First tree item is an empty guardian
        assert(tree.insert(0, 0) == 0);
    }

    /**
    * @notice Activate `_amount == 0 ? 'all available tokens' : @tokenAmount(self.token(), _amount)` for the next term
    * @param _amount Amount of guardian tokens to be activated for the next term
    */
    function activate(uint256 _amount) external {
        _activateTokens(msg.sender, _amount, msg.sender);
    }

    /**
    * @notice Deactivate `_amount == 0 ? 'all unlocked tokens' : @tokenAmount(self.token(), _amount)` for the next term
    * @param _amount Amount of guardian tokens to be deactivated for the next term
    */
    function deactivate(uint256 _amount) external {
        _deactivateTokens(msg.sender, _amount);
    }

    /**
    * @notice Stake `@tokenAmount(self.token(), _amount)` for the sender to the Protocol
    * @param _amount Amount of tokens to be staked
    * @param _data Optional data that can be used to request the activation of the transferred tokens
    */
    function stake(uint256 _amount, bytes calldata _data) external {
        _stake(msg.sender, msg.sender, _amount, _data);
    }

    /**
    * @notice Stake `@tokenAmount(self.token(), _amount)` for `_to` to the Protocol
    * @param _to Address to stake an amount of tokens to
    * @param _amount Amount of tokens to be staked
    * @param _data Optional data that can be used to request the activation of the transferred tokens
    */
    function stakeFor(address _to, uint256 _amount, bytes calldata _data) external {
        _stake(msg.sender, _to, _amount, _data);
    }

    /**
    * @notice Unstake `@tokenAmount(self.token(), _amount)` for `_to` from the Protocol
    * @param _amount Amount of tokens to be unstaked
    * @param _data Optional data is never used by this function, only logged
    */
    function unstake(uint256 _amount, bytes calldata _data) external {
        _unstake(msg.sender, _amount, _data);
    }

    /**
    * @dev Callback of approveAndCall, allows staking directly with a transaction to the token contract.
    * @param _from Address making the transfer
    * @param _amount Amount of tokens to transfer
    * @param _token Address of the token
    * @param _data Optional data that can be used to request the activation of the transferred tokens
    */
    function receiveApproval(address _from, uint256 _amount, address _token, bytes calldata _data) external {
        require(msg.sender == _token && _token == address(guardiansToken), ERROR_TOKEN_APPROVE_NOT_ALLOWED);
        _stake(_from, _from, _amount, _data);
    }

    /**
    * @notice Lock `@tokenAmount(self.token(), _amount)` of sender's active balance
    * @param _lockManager Address of the lock manager that will control the lock
    * @param _amount Amount of active tokens to be locked
    */
    function lockActivation(address _lockManager, uint256 _amount) external {
        _lockActivation(msg.sender, _lockManager, _amount);
    }

    /**
    * @notice Unlock `@tokenAmount(self.token(), _amount)` of `_guardian`'s active balance
    * @param _guardian Address of the guardian unlocking the active balance of
    * @param _lockManager Address of the lock manager controlling the lock
    * @param _amount Amount of active tokens to be unlocked
    * @param _deactivate Whether the requested amount must be deactivated too
    */
    function unlockActivation(address _guardian, address _lockManager, uint256 _amount, bool _deactivate) external {
        ActivationLocks storage activationLocks = guardiansByAddress[_guardian].activationLocks;
        uint256 lockedAmount = activationLocks.lockedBy[_lockManager];
        require(lockedAmount > 0, ERROR_ZERO_LOCK_ACTIVATION);

        uint256 amountToUnlock = _amount == 0 ? lockedAmount : _amount;
        bool canUnlock = _lockManager == msg.sender || ILockManager(_lockManager).canUnlock(_guardian, amountToUnlock);
        require(canUnlock, ERROR_CANNOT_UNLOCK_ACTIVATION);
        require(amountToUnlock <= lockedAmount, ERROR_INVALID_UNLOCK_ACTIVATION_AMOUNT);

        uint256 newLockedAmount = lockedAmount.sub(amountToUnlock);
        uint256 newTotalLocked = activationLocks.total.sub(amountToUnlock);

        activationLocks.total = newTotalLocked;
        activationLocks.lockedBy[_lockManager] = newLockedAmount;
        emit GuardianActivationLockChanged(_guardian, _lockManager, newLockedAmount, newTotalLocked);

        if (msg.sender == _guardian && _deactivate) {
            _deactivateTokens(_guardian, _amount);
        }
    }

    /**
    * @notice Process a token deactivation requested for `_guardian` if there is any
    * @param _guardian Address of the guardian to process the deactivation request of
    */
    function processDeactivationRequest(address _guardian) external {
        uint64 termId = _ensureCurrentTerm();
        _processDeactivationRequest(_guardian, termId);
    }

    /**
    * @notice Assign `@tokenAmount(self.token(), _amount)` to the available balance of `_guardian`
    * @param _guardian Guardian to add an amount of tokens to
    * @param _amount Amount of tokens to be added to the available balance of a guardian
    */
    function assignTokens(address _guardian, uint256 _amount) external onlyActiveDisputeManagers {
        if (_amount > 0) {
            _updateAvailableBalanceOf(_guardian, _amount, true);
            emit GuardianTokensAssigned(_guardian, _amount);
        }
    }

    /**
    * @notice Burn `@tokenAmount(self.token(), _amount)`
    * @param _amount Amount of tokens to be burned
    */
    function burnTokens(uint256 _amount) external onlyActiveDisputeManagers {
        if (_amount > 0) {
            _updateAvailableBalanceOf(BURN_ACCOUNT, _amount, true);
            emit GuardianTokensBurned(_amount);
        }
    }

    /**
    * @notice Draft a set of guardians based on given requirements for a term id
    * @param _params Array containing draft requirements:
    *        0. bytes32 Term randomness
    *        1. uint256 Dispute id
    *        2. uint64  Current term id
    *        3. uint256 Number of seats already filled
    *        4. uint256 Number of seats left to be filled
    *        5. uint64  Number of guardians required for the draft
    *        6. uint16  Permyriad of the minimum active balance to be locked for the draft
    *
    * @return guardians List of guardians selected for the draft
    * @return length Size of the list of the draft result
    */
    function draft(uint256[7] calldata _params) external onlyActiveDisputeManagers returns (address[] memory guardians, uint256 length) {
        DraftParams memory draftParams = _buildDraftParams(_params);
        guardians = new address[](draftParams.batchRequestedGuardians);

        // Guardians returned by the tree multi-sortition may not have enough unlocked active balance to be drafted. Thus,
        // we compute several sortitions until all the requested guardians are selected. To guarantee a different set of
        // guardians on each sortition, the iteration number will be part of the random seed to be used in the sortition.
        // Note that we are capping the number of iterations to avoid an OOG error, which means that this function could
        // return less guardians than the requested number.

        for (draftParams.iteration = 0;
             length < draftParams.batchRequestedGuardians && draftParams.iteration < MAX_DRAFT_ITERATIONS;
             draftParams.iteration++
        ) {
            (uint256[] memory guardianIds, uint256[] memory activeBalances) = _treeSearch(draftParams);

            for (uint256 i = 0; i < guardianIds.length && length < draftParams.batchRequestedGuardians; i++) {
                // We assume the selected guardians are registered in the registry, we are not checking their addresses exist
                address guardianAddress = guardiansAddressById[guardianIds[i]];
                Guardian storage guardian = guardiansByAddress[guardianAddress];

                // Compute new locked balance for a guardian based on the penalty applied when being drafted
                uint256 newLockedBalance = guardian.lockedBalance.add(draftParams.draftLockAmount);

                // Check if there is any deactivation requests for the next term. Drafts are always computed for the current term
                // but we have to make sure we are locking an amount that will exist in the next term.
                uint256 nextTermDeactivationRequestAmount = _deactivationRequestedAmountForTerm(guardian, draftParams.termId + 1);

                // Check if guardian has enough active tokens to lock the requested amount for the draft, skip it otherwise.
                uint256 currentActiveBalance = activeBalances[i];
                if (currentActiveBalance >= newLockedBalance) {

                    // Check if the amount of active tokens for the next term is enough to lock the required amount for
                    // the draft. Otherwise, reduce the requested deactivation amount of the next term.
                    // Next term deactivation amount should always be less than current active balance, but we make sure using SafeMath
                    uint256 nextTermActiveBalance = currentActiveBalance.sub(nextTermDeactivationRequestAmount);
                    if (nextTermActiveBalance < newLockedBalance) {
                        // No need for SafeMath: we already checked values above
                        _reduceDeactivationRequest(guardianAddress, newLockedBalance - nextTermActiveBalance, draftParams.termId);
                    }

                    // Update the current active locked balance of the guardian
                    guardian.lockedBalance = newLockedBalance;
                    guardians[length++] = guardianAddress;
                    emit GuardianBalanceLocked(guardianAddress, draftParams.draftLockAmount);
                }
            }
        }
    }

    /**
    * @notice Slash a set of guardians based on their votes compared to the winning ruling. This function will unlock the
    *         corresponding locked balances of those guardians that are set to be slashed.
    * @param _termId Current term id
    * @param _guardians List of guardian addresses to be slashed
    * @param _lockedAmounts List of amounts locked for each corresponding guardian that will be either slashed or returned
    * @param _rewardedGuardians List of booleans to tell whether a guardian's active balance has to be slashed or not
    * @return Total amount of slashed tokens
    */
    function slashOrUnlock(uint64 _termId, address[] calldata _guardians, uint256[] calldata _lockedAmounts, bool[] calldata _rewardedGuardians)
        external
        onlyActiveDisputeManagers
        returns (uint256)
    {
        require(_guardians.length == _lockedAmounts.length, ERROR_INVALID_LOCKED_AMOUNTS_LENGTH);
        require(_guardians.length == _rewardedGuardians.length, ERROR_INVALID_REWARDED_GUARDIANS_LENGTH);

        uint64 nextTermId = _termId + 1;
        uint256 collectedTokens;

        for (uint256 i = 0; i < _guardians.length; i++) {
            uint256 lockedAmount = _lockedAmounts[i];
            address guardianAddress = _guardians[i];
            Guardian storage guardian = guardiansByAddress[guardianAddress];
            guardian.lockedBalance = guardian.lockedBalance.sub(lockedAmount);

            // Slash guardian if requested. Note that there's no need to check if there was a deactivation
            // request since we're working with already locked balances.
            if (_rewardedGuardians[i]) {
                emit GuardianBalanceUnlocked(guardianAddress, lockedAmount);
            } else {
                collectedTokens = collectedTokens.add(lockedAmount);
                tree.update(guardian.id, nextTermId, lockedAmount, false);
                emit GuardianSlashed(guardianAddress, lockedAmount, nextTermId);
            }
        }

        return collectedTokens;
    }

    /**
    * @notice Try to collect `@tokenAmount(self.token(), _amount)` from `_guardian` for the term #`_termId + 1`.
    * @dev This function tries to decrease the active balance of a guardian for the next term based on the requested
    *      amount. It can be seen as a way to early-slash a guardian's active balance.
    * @param _guardian Guardian to collect the tokens from
    * @param _amount Amount of tokens to be collected from the given guardian and for the requested term id
    * @param _termId Current term id
    * @return True if the guardian has enough unlocked tokens to be collected for the requested term, false otherwise
    */
    function collectTokens(address _guardian, uint256 _amount, uint64 _termId) external onlyActiveDisputeManagers returns (bool) {
        if (_amount == 0) {
            return true;
        }

        uint64 nextTermId = _termId + 1;
        Guardian storage guardian = guardiansByAddress[_guardian];
        uint256 unlockedActiveBalance = _lastUnlockedActiveBalanceOf(guardian);
        uint256 nextTermDeactivationRequestAmount = _deactivationRequestedAmountForTerm(guardian, nextTermId);

        // Check if the guardian has enough unlocked tokens to collect the requested amount
        // Note that we're also considering the deactivation request if there is any
        uint256 totalUnlockedActiveBalance = unlockedActiveBalance.add(nextTermDeactivationRequestAmount);
        if (_amount > totalUnlockedActiveBalance) {
            return false;
        }

        // Check if the amount of active tokens is enough to collect the requested amount, otherwise reduce the requested deactivation amount of
        // the next term. Note that this behaviour is different to the one when drafting guardians since this function is called as a side effect
        // of a guardian deliberately voting in a final round, while drafts occur randomly.
        if (_amount > unlockedActiveBalance) {
            // No need for SafeMath: amounts were already checked above
            uint256 amountToReduce = _amount - unlockedActiveBalance;
            _reduceDeactivationRequest(_guardian, amountToReduce, _termId);
        }
        tree.update(guardian.id, nextTermId, _amount, false);

        emit GuardianTokensCollected(_guardian, _amount, nextTermId);
        return true;
    }

    /**
    * @notice Lock `_guardian`'s withdrawals until term #`_termId`
    * @dev This is intended for guardians who voted in a final round and were coherent with the final ruling to prevent 51% attacks
    * @param _guardian Address of the guardian to be locked
    * @param _termId Term ID until which the guardian's withdrawals will be locked
    */
    function lockWithdrawals(address _guardian, uint64 _termId) external onlyActiveDisputeManagers {
        Guardian storage guardian = guardiansByAddress[_guardian];
        guardian.withdrawalsLockTermId = _termId;
    }

    /**
    * @notice Set new limit of total active balance of guardian tokens
    * @param _totalActiveBalanceLimit New limit of total active balance of guardian tokens
    */
    function setTotalActiveBalanceLimit(uint256 _totalActiveBalanceLimit) external onlyConfigGovernor {
        _setTotalActiveBalanceLimit(_totalActiveBalanceLimit);
    }

    /**
    * @notice `_allowed ? 'Allow' : 'Disallow'` `_lockManager` as a lock manager
    * @param _lockManager Address of the lock manager to be changed
    * @param _allowed Whether the lock manager is whitelisted
    */
    function updateLockManagerWhitelist(address _lockManager, bool _allowed) external onlyConfigGovernor {
        whitelistedLockManagers[_lockManager] = _allowed;
        emit LockManagerWhitelistChanged(_lockManager, _allowed);
    }

    /**
    * @dev ERC900 - Tell the address of the token used for staking
    * @return Address of the token used for staking
    */
    function token() external view returns (address) {
        return address(guardiansToken);
    }

    /**
    * @dev ERC900 - Tell the total amount of guardian tokens held by the registry contract
    * @return Amount of guardian tokens held by the registry contract
    */
    function totalStaked() external view returns (uint256) {
        return guardiansToken.balanceOf(address(this));
    }

    /**
    * @dev Tell the total amount of active guardian tokens
    * @return Total amount of active guardian tokens
    */
    function totalActiveBalance() external view returns (uint256) {
        return tree.getTotal();
    }

    /**
    * @dev Tell the total amount of active guardian tokens at the given term id
    * @param _termId Term ID querying the total active balance for
    * @return Total amount of active guardian tokens at the given term id
    */
    function totalActiveBalanceAt(uint64 _termId) external view returns (uint256) {
        return _totalActiveBalanceAt(_termId);
    }

    /**
    * @dev ERC900 - Tell the total amount of tokens of guardian. This includes the active balance, the available
    *      balances, and the pending balance for deactivation. Note that we don't have to include the locked
    *      balances since these represent the amount of active tokens that are locked for drafts, i.e. these
    *      are included in the active balance of the guardian.
    * @param _guardian Address of the guardian querying the total amount of tokens staked of
    * @return Total amount of tokens of a guardian
    */
    function totalStakedFor(address _guardian) external view returns (uint256) {
        return _totalStakedFor(_guardian);
    }

    /**
    * @dev Tell the balance information of a guardian
    * @param _guardian Address of the guardian querying the balance information of
    * @return active Amount of active tokens of a guardian
    * @return available Amount of available tokens of a guardian
    * @return locked Amount of active tokens that are locked due to ongoing disputes
    * @return pendingDeactivation Amount of active tokens that were requested for deactivation
    */
    function balanceOf(address _guardian) external view
        returns (uint256 active, uint256 available, uint256 locked, uint256 pendingDeactivation)
    {
        return _balanceOf(_guardian);
    }

    /**
    * @dev Tell the balance information of a guardian, fecthing tree one at a given term
    * @param _guardian Address of the guardian querying the balance information of
    * @param _termId Term ID querying the active balance for
    * @return active Amount of active tokens of a guardian
    * @return available Amount of available tokens of a guardian
    * @return locked Amount of active tokens that are locked due to ongoing disputes
    * @return pendingDeactivation Amount of active tokens that were requested for deactivation
    */
    function balanceOfAt(address _guardian, uint64 _termId) external view
        returns (uint256 active, uint256 available, uint256 locked, uint256 pendingDeactivation)
    {
        Guardian storage guardian = guardiansByAddress[_guardian];

        active = _existsGuardian(guardian) ? tree.getItemAt(guardian.id, _termId) : 0;
        (available, locked, pendingDeactivation) = _getBalances(guardian);
    }

    /**
    * @dev Tell the active balance of a guardian for a given term id
    * @param _guardian Address of the guardian querying the active balance of
    * @param _termId Term ID querying the active balance for
    * @return Amount of active tokens for guardian in the requested past term id
    */
    function activeBalanceOfAt(address _guardian, uint64 _termId) external view returns (uint256) {
        return _activeBalanceOfAt(_guardian, _termId);
    }

    /**
    * @dev Tell the amount of active tokens of a guardian at the last ensured term that are not locked due to ongoing disputes
    * @param _guardian Address of the guardian querying the unlocked balance of
    * @return Amount of active tokens of a guardian that are not locked due to ongoing disputes
    */
    function unlockedActiveBalanceOf(address _guardian) external view returns (uint256) {
        Guardian storage guardian = guardiansByAddress[_guardian];
        return _currentUnlockedActiveBalanceOf(guardian);
    }

    /**
    * @dev Tell the pending deactivation details for a guardian
    * @param _guardian Address of the guardian whose info is requested
    * @return amount Amount to be deactivated
    * @return availableTermId Term in which the deactivated amount will be available
    */
    function getDeactivationRequest(address _guardian) external view returns (uint256 amount, uint64 availableTermId) {
        DeactivationRequest storage request = guardiansByAddress[_guardian].deactivationRequest;
        return (request.amount, request.availableTermId);
    }

    /**
    * @dev Tell the activation amount locked for a guardian by a lock manager
    * @param _guardian Address of the guardian whose info is requested
    * @param _lockManager Address of the lock manager querying the lock of
    * @return amount Activation amount locked by the lock manager
    * @return total Total activation amount locked for the guardian
    */
    function getActivationLock(address _guardian, address _lockManager) external view returns (uint256 amount, uint256 total) {
        ActivationLocks storage activationLocks = guardiansByAddress[_guardian].activationLocks;
        total = activationLocks.total;
        amount = activationLocks.lockedBy[_lockManager];
    }

    /**
    * @dev Tell the withdrawals lock term ID for a guardian
    * @param _guardian Address of the guardian whose info is requested
    * @return Term ID until which the guardian's withdrawals will be locked
    */
    function getWithdrawalsLockTermId(address _guardian) external view returns (uint64) {
        return guardiansByAddress[_guardian].withdrawalsLockTermId;
    }

    /**
    * @dev Tell the identification number associated to a guardian address
    * @param _guardian Address of the guardian querying the identification number of
    * @return Identification number associated to a guardian address, zero in case it wasn't registered yet
    */
    function getGuardianId(address _guardian) external view returns (uint256) {
        return guardiansByAddress[_guardian].id;
    }

    /**
    * @dev Tell the maximum amount of total active balance that can be held in the registry
    * @return Maximum amount of total active balance that can be held in the registry
    */
    function totalGuardiansActiveBalanceLimit() external view returns (uint256) {
        return totalActiveBalanceLimit;
    }

    /**
    * @dev Tell whether a lock manager is whitelisted
    * @param _lockManager Address of the lock manager being queried
    * @return True if the lock manager is whitelisted
    */
    function isLockManagerWhitelisted(address _lockManager) external view returns (bool) {
        return _isLockManagerWhitelisted(_lockManager);
    }

    /**
    * @dev ERC900 - Tell if the current registry supports historic information or not
    * @return Always false
    */
    function supportsHistory() external pure returns (bool) {
        return false;
    }

    /**
    * @dev Internal function to activate a given amount of tokens for a guardian.
    *      This function assumes that the given term is the current term and has already been ensured.
    * @param _guardian Address of the guardian to activate tokens
    * @param _amount Amount of guardian tokens to be activated
    * @param _sender Address of the account requesting the activation
    */
    function _activateTokens(address _guardian, uint256 _amount, address _sender) internal {
        uint64 termId = _ensureCurrentTerm();

        // Try to clean a previous deactivation request if any
        _processDeactivationRequest(_guardian, termId);

        uint256 availableBalance = guardiansByAddress[_guardian].availableBalance;
        uint256 amountToActivate = _amount == 0 ? availableBalance : _amount;
        require(amountToActivate > 0, ERROR_INVALID_ZERO_AMOUNT);
        require(amountToActivate <= availableBalance, ERROR_INVALID_ACTIVATION_AMOUNT);

        uint64 nextTermId = termId + 1;
        _checkTotalActiveBalance(nextTermId, amountToActivate);
        Guardian storage guardian = guardiansByAddress[_guardian];
        uint256 minActiveBalance = _getMinActiveBalance(nextTermId);

        if (_existsGuardian(guardian)) {
            // Even though we are adding amounts, let's check the new active balance is greater than or equal to the
            // minimum active amount. Note that the guardian might have been slashed.
            uint256 activeBalance = tree.getItem(guardian.id);
            require(activeBalance.add(amountToActivate) >= minActiveBalance, ERROR_ACTIVE_BALANCE_BELOW_MIN);
            tree.update(guardian.id, nextTermId, amountToActivate, true);
        } else {
            require(amountToActivate >= minActiveBalance, ERROR_ACTIVE_BALANCE_BELOW_MIN);
            guardian.id = tree.insert(nextTermId, amountToActivate);
            guardiansAddressById[guardian.id] = _guardian;
        }

        _updateAvailableBalanceOf(_guardian, amountToActivate, false);
        emit GuardianActivated(_guardian, nextTermId, amountToActivate, _sender);
    }

    /**
    * @dev Internal function to deactivate a given amount of tokens for a guardian.
    * @param _guardian Address of the guardian to deactivate tokens
    * @param _amount Amount of guardian tokens to be deactivated for the next term
    */
    function _deactivateTokens(address _guardian, uint256 _amount) internal {
        uint64 termId = _ensureCurrentTerm();
        Guardian storage guardian = guardiansByAddress[_guardian];
        uint256 unlockedActiveBalance = _lastUnlockedActiveBalanceOf(guardian);
        uint256 amountToDeactivate = _amount == 0 ? unlockedActiveBalance : _amount;
        require(amountToDeactivate > 0, ERROR_INVALID_ZERO_AMOUNT);
        require(amountToDeactivate <= unlockedActiveBalance, ERROR_INVALID_DEACTIVATION_AMOUNT);

        // Check future balance is not below the total activation lock of the guardian
        // No need for SafeMath: we already checked values above
        uint256 futureActiveBalance = unlockedActiveBalance - amountToDeactivate;
        uint256 totalActivationLock = guardian.activationLocks.total;
        require(futureActiveBalance >= totalActivationLock, ERROR_DEACTIVATION_AMOUNT_EXCEEDS_LOCK);

        // Check that the guardian is leaving or that the minimum active balance is met
        uint256 minActiveBalance = _getMinActiveBalance(termId);
        require(futureActiveBalance == 0 || futureActiveBalance >= minActiveBalance, ERROR_INVALID_DEACTIVATION_AMOUNT);

        _createDeactivationRequest(_guardian, amountToDeactivate);
    }

    /**
    * @dev Internal function to create a token deactivation request for a guardian. Guardians will be allowed
    *      to process a deactivation request from the next term.
    * @param _guardian Address of the guardian to create a token deactivation request for
    * @param _amount Amount of guardian tokens requested for deactivation
    */
    function _createDeactivationRequest(address _guardian, uint256 _amount) internal {
        uint64 termId = _ensureCurrentTerm();

        // Try to clean a previous deactivation request if possible
        _processDeactivationRequest(_guardian, termId);

        uint64 nextTermId = termId + 1;
        Guardian storage guardian = guardiansByAddress[_guardian];
        DeactivationRequest storage request = guardian.deactivationRequest;
        request.amount = request.amount.add(_amount);
        request.availableTermId = nextTermId;
        tree.update(guardian.id, nextTermId, _amount, false);

        emit GuardianDeactivationRequested(_guardian, nextTermId, _amount);
    }

    /**
    * @dev Internal function to process a token deactivation requested by a guardian. It will move the requested amount
    *      to the available balance of the guardian if the term when the deactivation was requested has already finished.
    * @param _guardian Address of the guardian to process the deactivation request of
    * @param _termId Current term id
    */
    function _processDeactivationRequest(address _guardian, uint64 _termId) internal {
        Guardian storage guardian = guardiansByAddress[_guardian];
        DeactivationRequest storage request = guardian.deactivationRequest;
        uint64 deactivationAvailableTermId = request.availableTermId;

        // If there is a deactivation request, ensure that the deactivation term has been reached
        if (deactivationAvailableTermId == uint64(0) || _termId < deactivationAvailableTermId) {
            return;
        }

        uint256 deactivationAmount = request.amount;
        // Note that we can use a zeroed term ID to denote void here since we are storing
        // the minimum allowed term to deactivate tokens which will always be at least 1.
        request.availableTermId = uint64(0);
        request.amount = 0;
        _updateAvailableBalanceOf(_guardian, deactivationAmount, true);

        emit GuardianDeactivationProcessed(_guardian, deactivationAvailableTermId, deactivationAmount, _termId);
    }

    /**
    * @dev Internal function to reduce a token deactivation requested by a guardian. It assumes the deactivation request
    *      cannot be processed for the given term yet.
    * @param _guardian Address of the guardian to reduce the deactivation request of
    * @param _amount Amount to be reduced from the current deactivation request
    * @param _termId Term ID in which the deactivation request is being reduced
    */
    function _reduceDeactivationRequest(address _guardian, uint256 _amount, uint64 _termId) internal {
        Guardian storage guardian = guardiansByAddress[_guardian];
        DeactivationRequest storage request = guardian.deactivationRequest;
        uint256 currentRequestAmount = request.amount;
        require(currentRequestAmount >= _amount, ERROR_CANNOT_REDUCE_DEACTIVATION_REQUEST);

        // No need for SafeMath: we already checked values above
        uint256 newRequestAmount = currentRequestAmount - _amount;
        request.amount = newRequestAmount;

        // Move amount back to the tree
        tree.update(guardian.id, _termId + 1, _amount, true);

        emit GuardianDeactivationUpdated(_guardian, request.availableTermId, newRequestAmount, _termId);
    }

    /**
    * @dev Internal function to update the activation locked amount of a guardian
    * @param _guardian Guardian to update the activation locked amount of
    * @param _lockManager Address of the lock manager controlling the lock
    * @param _amount Amount of tokens to be added to the activation locked amount of the guardian
    */
    function _lockActivation(address _guardian, address _lockManager, uint256 _amount) internal {
        bool isAllowed = _isLockManagerWhitelisted(_lockManager) || _isLockManagerWhitelisted(ANY_ENTITY);
        require(isAllowed, ERROR_LOCK_MANAGER_NOT_ALLOWED);

        ActivationLocks storage activationLocks = guardiansByAddress[_guardian].activationLocks;
        uint256 newTotalLocked = activationLocks.total.add(_amount);
        uint256 newLockedAmount = activationLocks.lockedBy[_lockManager].add(_amount);

        activationLocks.total = newTotalLocked;
        activationLocks.lockedBy[_lockManager] = newLockedAmount;
        emit GuardianActivationLockChanged(_guardian, _lockManager, newLockedAmount, newTotalLocked);
    }

    /**
    * @dev Internal function to stake an amount of tokens for a guardian
    * @param _from Address sending the amount of tokens to be deposited
    * @param _guardian Address of the guardian to deposit the tokens to
    * @param _amount Amount of tokens to be deposited
    * @param _data Optional data that can be used to request the activation of the deposited tokens
    */
    function _stake(address _from, address _guardian, uint256 _amount, bytes memory _data) internal {
        require(_amount > 0, ERROR_INVALID_ZERO_AMOUNT);
        _updateAvailableBalanceOf(_guardian, _amount, true);

        // Activate tokens if it was requested by the sender. Note that there's no need to check
        // the activation amount since we have just added it to the available balance of the guardian.
        // TODO: implement activators whitelist
        if (_data.toBytes4() == GuardiansRegistry(this).activate.selector) {
            _activateTokens(_guardian, _amount, _from);
        } else if (_data.toBytes4() == GuardiansRegistry(this).lockActivation.selector) {
            _activateTokens(_guardian, _amount, _from);
            _lockActivation(_guardian, _from, _amount);
        }

        emit Staked(_guardian, _amount, _totalStakedFor(_guardian), _data);
        require(guardiansToken.safeTransferFrom(_from, address(this), _amount), ERROR_TOKEN_TRANSFER_FAILED);
    }

    /**
    * @dev Internal function to unstake an amount of tokens of a guardian
    * @param _guardian Address of the guardian to to unstake the tokens of
    * @param _amount Amount of tokens to be unstaked
    * @param _data Optional data is never used by this function, only logged
    */
    function _unstake(address _guardian, uint256 _amount, bytes memory _data) internal {
        require(_amount > 0, ERROR_INVALID_ZERO_AMOUNT);

        // Try to process a deactivation request for the current term if there is one. Note that we don't need to ensure
        // the current term this time since deactivation requests always work with future terms, which means that if
        // the current term is outdated, it will never match the deactivation term id. We avoid ensuring the term here
        // to avoid forcing guardians to do that in order to withdraw their available balance. Same applies to final round locks.
        uint64 lastEnsuredTermId = _getLastEnsuredTermId();

        // Check that guardian's withdrawals are not locked
        uint64 withdrawalsLockTermId = guardiansByAddress[_guardian].withdrawalsLockTermId;
        require(withdrawalsLockTermId == 0 || withdrawalsLockTermId < lastEnsuredTermId, ERROR_WITHDRAWALS_LOCK);

        _processDeactivationRequest(_guardian, lastEnsuredTermId);

        _updateAvailableBalanceOf(_guardian, _amount, false);
        emit Unstaked(_guardian, _amount, _totalStakedFor(_guardian), _data);
        require(guardiansToken.safeTransfer(_guardian, _amount), ERROR_TOKEN_TRANSFER_FAILED);
    }

    /**
    * @dev Internal function to update the available balance of a guardian
    * @param _guardian Guardian to update the available balance of
    * @param _amount Amount of tokens to be added to or removed from the available balance of a guardian
    * @param _positive True if the given amount should be added, or false to remove it from the available balance
    */
    function _updateAvailableBalanceOf(address _guardian, uint256 _amount, bool _positive) internal {
        // We are not using a require here to avoid reverting in case any of the treasury maths reaches this point
        // with a zeroed amount value. Instead, we are doing this validation in the external entry points such as
        // stake, unstake, activate, deactivate, among others.
        if (_amount == 0) {
            return;
        }

        Guardian storage guardian = guardiansByAddress[_guardian];
        if (_positive) {
            guardian.availableBalance = guardian.availableBalance.add(_amount);
        } else {
            require(_amount <= guardian.availableBalance, ERROR_NOT_ENOUGH_AVAILABLE_BALANCE);
            // No need for SafeMath: we already checked values right above
            guardian.availableBalance -= _amount;
        }
    }

    /**
    * @dev Internal function to set new limit of total active balance of guardian tokens
    * @param _totalActiveBalanceLimit New limit of total active balance of guardian tokens
    */
    function _setTotalActiveBalanceLimit(uint256 _totalActiveBalanceLimit) internal {
        require(_totalActiveBalanceLimit > 0, ERROR_BAD_TOTAL_ACTIVE_BALANCE_LIMIT);
        emit TotalActiveBalanceLimitChanged(totalActiveBalanceLimit, _totalActiveBalanceLimit);
        totalActiveBalanceLimit = _totalActiveBalanceLimit;
    }

    /**
    * @dev Internal function to tell the total amount of tokens of guardian
    * @param _guardian Address of the guardian querying the total amount of tokens staked of
    * @return Total amount of tokens of a guardian
    */
    function _totalStakedFor(address _guardian) internal view returns (uint256) {
        (uint256 active, uint256 available, , uint256 pendingDeactivation) = _balanceOf(_guardian);
        return available.add(active).add(pendingDeactivation);
    }

    /**
    * @dev Internal function to tell the balance information of a guardian
    * @param _guardian Address of the guardian querying the balance information of
    * @return active Amount of active tokens of a guardian
    * @return available Amount of available tokens of a guardian
    * @return locked Amount of active tokens that are locked due to ongoing disputes
    * @return pendingDeactivation Amount of active tokens that were requested for deactivation
    */
    function _balanceOf(address _guardian) internal view
        returns (uint256 active, uint256 available, uint256 locked, uint256 pendingDeactivation)
    {
        Guardian storage guardian = guardiansByAddress[_guardian];

        active = _existsGuardian(guardian) ? tree.getItem(guardian.id) : 0;
        (available, locked, pendingDeactivation) = _getBalances(guardian);
    }

    /**
    * @dev Tell the active balance of a guardian for a given term id
    * @param _guardian Address of the guardian querying the active balance of
    * @param _termId Term ID querying the active balance for
    * @return Amount of active tokens for guardian in the requested past term id
    */
    function _activeBalanceOfAt(address _guardian, uint64 _termId) internal view returns (uint256) {
        Guardian storage guardian = guardiansByAddress[_guardian];
        return _existsGuardian(guardian) ? tree.getItemAt(guardian.id, _termId) : 0;
    }

    /**
    * @dev Internal function to get the amount of active tokens of a guardian that are not locked due to ongoing disputes
    *      It will use the last value, that might be in a future term
    * @param _guardian Guardian querying the unlocked active balance of
    * @return Amount of active tokens of a guardian that are not locked due to ongoing disputes
    */
    function _lastUnlockedActiveBalanceOf(Guardian storage _guardian) internal view returns (uint256) {
        return _existsGuardian(_guardian) ? tree.getItem(_guardian.id).sub(_guardian.lockedBalance) : 0;
    }

    /**
    * @dev Internal function to get the amount of active tokens at the last ensured term of a guardian that are not locked due to ongoing disputes
    * @param _guardian Guardian querying the unlocked active balance of
    * @return Amount of active tokens of a guardian that are not locked due to ongoing disputes
    */
    function _currentUnlockedActiveBalanceOf(Guardian storage _guardian) internal view returns (uint256) {
        uint64 lastEnsuredTermId = _getLastEnsuredTermId();
        return _existsGuardian(_guardian) ? tree.getItemAt(_guardian.id, lastEnsuredTermId).sub(_guardian.lockedBalance) : 0;
    }

    /**
    * @dev Internal function to check if a guardian was already registered
    * @param _guardian Guardian to be checked
    * @return True if the given guardian was already registered, false otherwise
    */
    function _existsGuardian(Guardian storage _guardian) internal view returns (bool) {
        return _guardian.id != 0;
    }

    /**
    * @dev Internal function to get the amount of a deactivation request for a given term id
    * @param _guardian Guardian to query the deactivation request amount of
    * @param _termId Term ID of the deactivation request to be queried
    * @return Amount of the deactivation request for the given term, 0 otherwise
    */
    function _deactivationRequestedAmountForTerm(Guardian storage _guardian, uint64 _termId) internal view returns (uint256) {
        DeactivationRequest storage request = _guardian.deactivationRequest;
        return request.availableTermId == _termId ? request.amount : 0;
    }

    /**
    * @dev Internal function to tell the total amount of active guardian tokens at the given term id
    * @param _termId Term ID querying the total active balance for
    * @return Total amount of active guardian tokens at the given term id
    */
    function _totalActiveBalanceAt(uint64 _termId) internal view returns (uint256) {
        // This function will return always the same values, the only difference remains on gas costs. In case we look for a
        // recent term, in this case current or future ones, we perform a backwards linear search from the last checkpoint.
        // Otherwise, a binary search is computed.
        bool recent = _termId >= _getLastEnsuredTermId();
        return recent ? tree.getRecentTotalAt(_termId) : tree.getTotalAt(_termId);
    }

    /**
    * @dev Internal function to check if its possible to add a given new amount to the registry or not
    * @param _termId Term ID when the new amount will be added
    * @param _amount Amount of tokens willing to be added to the registry
    */
    function _checkTotalActiveBalance(uint64 _termId, uint256 _amount) internal view {
        uint256 currentTotalActiveBalance = _totalActiveBalanceAt(_termId);
        uint256 newTotalActiveBalance = currentTotalActiveBalance.add(_amount);
        require(newTotalActiveBalance <= totalActiveBalanceLimit, ERROR_TOTAL_ACTIVE_BALANCE_EXCEEDED);
    }

    /**
    * @dev Tell the local balance information of a guardian (that is not on the tree)
    * @param _guardian Address of the guardian querying the balance information of
    * @return available Amount of available tokens of a guardian
    * @return locked Amount of active tokens that are locked due to ongoing disputes
    * @return pendingDeactivation Amount of active tokens that were requested for deactivation
    */
    function _getBalances(Guardian storage _guardian) internal view returns (uint256 available, uint256 locked, uint256 pendingDeactivation) {
        available = _guardian.availableBalance;
        locked = _guardian.lockedBalance;
        pendingDeactivation = _guardian.deactivationRequest.amount;
    }

    /**
    * @dev Tell whether a lock manager is whitelisted
    * @param _lockManager Address of the lock manager being queried
    * @return True if the lock manager is whitelisted
    */
    function _isLockManagerWhitelisted(address _lockManager) internal view returns (bool) {
        return whitelistedLockManagers[_lockManager];
    }

    /**
    * @dev Internal function to search guardians in the tree based on certain search restrictions
    * @param _params Draft params to be used for the guardians search
    * @return ids List of guardian ids obtained based on the requested search
    * @return activeBalances List of active balances for each guardian obtained based on the requested search
    */
    function _treeSearch(DraftParams memory _params) internal view returns (uint256[] memory ids, uint256[] memory activeBalances) {
        (ids, activeBalances) = tree.batchedRandomSearch(
            _params.termRandomness,
            _params.disputeId,
            _params.termId,
            _params.selectedGuardians,
            _params.batchRequestedGuardians,
            _params.roundRequestedGuardians,
            _params.iteration
        );
    }

    /**
    * @dev Private function to parse a certain set given of draft params
    * @param _params Array containing draft requirements:
    *        0. bytes32 Term randomness
    *        1. uint256 Dispute id
    *        2. uint64  Current term id
    *        3. uint256 Number of seats already filled
    *        4. uint256 Number of seats left to be filled
    *        5. uint64  Number of guardians required for the draft
    *        6. uint16  Permyriad of the minimum active balance to be locked for the draft
    *
    * @return Draft params object parsed
    */
    function _buildDraftParams(uint256[7] memory _params) private view returns (DraftParams memory) {
        uint64 termId = uint64(_params[2]);
        uint256 minActiveBalance = _getMinActiveBalance(termId);

        return DraftParams({
            termRandomness: bytes32(_params[0]),
            disputeId: _params[1],
            termId: termId,
            selectedGuardians: _params[3],
            batchRequestedGuardians: _params[4],
            roundRequestedGuardians: _params[5],
            draftLockAmount: minActiveBalance.pct(uint16(_params[6])),
            iteration: 0
        });
    }
}
