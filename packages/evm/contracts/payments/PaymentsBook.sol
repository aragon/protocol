pragma solidity ^0.5.8;

import "../lib/os/ERC20.sol";
import "../lib/os/SafeMath.sol";
import "../lib/os/SafeMath64.sol";
import "../lib/os/SafeERC20.sol";
import "../lib/os/TimeHelpers.sol";

import "./IPaymentsBook.sol";
import "../lib/PctHelpers.sol";
import "../registry/IJurorsRegistry.sol";
import "../court/controller/Controller.sol";
import "../court/controller/ControlledRecoverable.sol";


contract PaymentsBook is ControlledRecoverable, TimeHelpers, IPaymentsBook {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using SafeMath64 for uint64;
    using PctHelpers for uint256;

    string private constant ERROR_COURT_HAS_NOT_STARTED = "PB_COURT_HAS_NOT_STARTED";
    string private constant ERROR_NON_PAST_PERIOD = "PB_NON_PAST_PERIOD";
    string private constant ERROR_PERIOD_DURATION_ZERO = "PB_PERIOD_DURATION_ZERO";
    string private constant ERROR_PERIOD_BALANCE_DETAILS_NOT_COMPUTED = "PB_PERIOD_BALANCE_DETAILS_NOT_COMPUTED";
    string private constant ERROR_PAYMENT_AMOUNT_ZERO = "PB_PAYMENT_AMOUNT_ZERO";
    string private constant ERROR_ETH_DEPOSIT_MISMATCH = "PB_ETH_DEPOSIT_MISMATCH";
    string private constant ERROR_ETH_TRANSFER_FAILED = "PB_ETH_TRANSFER_FAILED";
    string private constant ERROR_TOKEN_DEPOSIT_FAILED = "PB_TOKEN_DEPOSIT_FAILED";
    string private constant ERROR_TOKEN_TRANSFER_FAILED = "PB_TOKEN_TRANSFER_FAILED";
    string private constant ERROR_JUROR_FEES_ALREADY_CLAIMED = "PB_JUROR_FEES_ALREADY_CLAIMED";
    string private constant ERROR_OVERRATED_GOVERNOR_SHARE_PCT = "PB_OVERRATED_GOVERNOR_SHARE_PCT";

    // Term 0 is for jurors on-boarding
    uint64 internal constant START_TERM_ID = 1;

    struct Period {
        // Court term ID of a period used to fetch the total active balance of the jurors registry
        uint64 balanceCheckpoint;
        // Total amount of juror tokens active in the Court at the corresponding period checkpoint
        uint256 totalActiveBalance;
        // List of collected juror fees indexed by token address
        mapping (address => uint256) jurorFees;
        // List of collected governor fees indexed by token address
        mapping (address => uint256) governorFees;
        // List of jurors that have claimed fees during a period, indexed by juror and token addresses
        mapping (address => mapping (address => bool)) claimedJurorFees;
    }

    // Duration of a payment period in Court terms
    uint64 public periodDuration;

    // Permyriad of collected fees that will be allocated to the governor of the Court (‱ - 1/10,000)
    uint16 public governorSharePct;

    // List of periods indexed by ID
    mapping (uint256 => Period) internal periods;

    event PaymentReceived(uint256 indexed periodId, address indexed payer, address indexed token, uint256 amount, address sender, bytes data);
    event JurorFeesClaimed(uint256 indexed periodId, address indexed juror, address indexed token, uint256 amount);
    event GovernorFeesTransferred(uint256 indexed periodId, address indexed token, uint256 amount);
    event GovernorSharePctChanged(uint16 previousGovernorSharePct, uint16 currentGovernorSharePct);

    /**
    * @dev Initialize court payments book
    * @param _controller Address of the controller
    * @param _periodDuration Duration of a payment period in Court terms
    * @param _governorSharePct Initial permyriad of collected fees that will be allocated to the governor of the Court (‱ - 1/10,000)
    */
    constructor(Controller _controller, uint64 _periodDuration, uint16 _governorSharePct)
        ControlledRecoverable(_controller)
        public
    {
        // No need to explicitly call `Controlled` constructor since `ControlledRecoverable` is already doing it
        require(_periodDuration > 0, ERROR_PERIOD_DURATION_ZERO);

        periodDuration = _periodDuration;
        _setGovernorSharePct(_governorSharePct);
    }

    /**
    * @notice Pay `@tokenAmount(_token, _amount)` for `_payer` (`_data`)
    * @param _token Address of the token being paid
    * @param _amount Amount of tokens being paid
    * @param _payer Address paying on behalf of
    * @param _data Optional data
    */
    function pay(address _token, uint256 _amount, address _payer, bytes calldata _data) external payable {
        (uint256 periodId, Period storage period) = _getCurrentPeriod();
        require(_amount > 0, ERROR_PAYMENT_AMOUNT_ZERO);

        // Update collected fees for the governor
        uint256 governorFees = _amount.pct(governorSharePct);
        period.governorFees[_token] = period.governorFees[_token].add(governorFees);

        // Update collected fees for the jurors
        uint256 jurorFees = _amount.sub(governorFees);
        period.jurorFees[_token] = period.jurorFees[_token].add(jurorFees);

        // Deposit tokens from sender to this contract
        _deposit(msg.sender, _token, _amount);
        emit PaymentReceived(periodId, _payer, _token, _amount, msg.sender, _data);
    }

    /**
    * @notice Claim jurors fees for period #`_periodId` owed to `msg.sender`
    * @param _periodId Identification number of the period which fees are claimed for
    * @param _token Address of the token to be claimed
    */
    function claimJurorFees(uint256 _periodId, address _token) external {
        require(_periodId < _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        require(!_hasClaimedJurorFees(period, msg.sender, _token), ERROR_JUROR_FEES_ALREADY_CLAIMED);

        (uint64 periodBalanceCheckpoint, uint256 totalActiveBalance) = _ensurePeriodBalanceDetails(period, _periodId);
        uint256 jurorActiveBalance = _getJurorActiveBalance(msg.sender, periodBalanceCheckpoint);
        uint256 amount = _getJurorFees(period, _token, jurorActiveBalance, totalActiveBalance);
        _claimJurorFees(period, _periodId, msg.sender, _token, amount);
    }

    /**
    * @notice Claim juror fees for period #`_periodId` owed to `msg.sender`
    * @dev It will ignore tokens that were already claimed without reverting
    * @param _periodId Identification number of the period which fees are claimed for
    * @param _tokens List of token addresses to be claimed
    */
    function claimManyJurorFees(uint256 _periodId, address[] calldata _tokens) external {
        require(_periodId < _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        (uint64 periodBalanceCheckpoint, uint256 totalActiveBalance) = _ensurePeriodBalanceDetails(period, _periodId);
        uint256 jurorActiveBalance = _getJurorActiveBalance(msg.sender, periodBalanceCheckpoint);

        // We assume the token contract is not malicious
        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            if (!_hasClaimedJurorFees(period, msg.sender, token)) {
                uint256 amount = _getJurorFees(period, token, jurorActiveBalance, totalActiveBalance);
                _claimJurorFees(period, _periodId, msg.sender, token, amount);
            }
        }
    }

    /**
    * @notice Transfer owed fees to the governor for period #`_periodId`
    * @param _periodId Identification number of the period being claimed
    * @param _token Address of the token to be claimed
    */
    function transferGovernorFees(uint256 _periodId, address _token) external {
        require(_periodId <= _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        address payable governor = address(uint160(_configGovernor()));
        _transferGovernorFees(period, _periodId, governor, _token);
    }

    /**
    * @notice Transfer owed fees to the governor for period #`_periodId`
    * @param _periodId Identification number of the period being claimed
    * @param _tokens List of token addresses to be claimed
    */
    function transferManyGovernorFees(uint256 _periodId, address[] calldata _tokens) external {
        require(_periodId <= _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        address payable governor = address(uint160(_configGovernor()));

        // We assume the token contract is not malicious
        for (uint256 i = 0; i < _tokens.length; i++) {
            _transferGovernorFees(period, _periodId, governor, _tokens[i]);
        }
    }

    /**
    * @notice Make sure that the balance details of a certain period have been computed
    * @param _periodId Identification number of the period being ensured
    * @return periodBalanceCheckpoint Court term ID used to fetch the total active balance of the jurors registry
    * @return totalActiveBalance Total amount of juror tokens active in the Court at the corresponding used checkpoint
    */
    function ensurePeriodBalanceDetails(uint256 _periodId) external returns (uint64 periodBalanceCheckpoint, uint256 totalActiveBalance) {
        require(_periodId < _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);
        Period storage period = periods[_periodId];
        return _ensurePeriodBalanceDetails(period, _periodId);
    }

    /**
    * @notice Set new governor share to `_governorSharePct`‱ (1/10,000)
    * @param _governorSharePct New permyriad of collected fees that will be allocated to the governor of the Court (‱ - 1/10,000)
    */
    function setGovernorSharePct(uint16 _governorSharePct) external onlyConfigGovernor {
        _setGovernorSharePct(_governorSharePct);
    }

    /**
    * @dev Tell the identification number of the current period
    * @return Identification number of the current period
    */
    function getCurrentPeriodId() external view returns (uint256) {
        return _getCurrentPeriodId();
    }

    /**
    * @dev Get the fee details of a payment period
    * @param _periodId Identification number of the period to be queried
    * @param _token Address of the token querying the fee details for
    * @return jurorFees Juror fees for the requested period and token
    * @return governorFees Governor fees for the requested period and token
    */
    function getPeriodFees(uint256 _periodId, address _token)
        external
        view
        returns (uint256 jurorFees, uint256 governorFees)
    {
        Period storage period = periods[_periodId];
        jurorFees = period.jurorFees[_token];
        governorFees = period.governorFees[_token];
    }

    /**
    * @dev Get the balance details of a payment period
    * @param _periodId Identification number of the period to be queried
    * @return balanceCheckpoint Court term ID of a period used to fetch the total active balance of the jurors registry
    * @return totalActiveBalance Total amount of juror tokens active in the Court at the corresponding period checkpoint
    */
    function getPeriodBalanceDetails(uint256 _periodId)
        external
        view
        returns (uint64 balanceCheckpoint, uint256 totalActiveBalance)
    {
        Period storage period = periods[_periodId];
        balanceCheckpoint = period.balanceCheckpoint;
        totalActiveBalance = period.totalActiveBalance;
    }

    /**
    * @dev Tell the fees corresponding to a juror for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _juror Address of the juror querying the owed fees of
    * @param _token Address of the token to be queried
    * @return Token amount corresponding to the juror
    */
    function getJurorFees(uint256 _periodId, address _juror, address _token) external view returns (uint256) {
        require(_periodId < _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        uint256 totalActiveBalance = period.totalActiveBalance;
        require(totalActiveBalance != 0, ERROR_PERIOD_BALANCE_DETAILS_NOT_COMPUTED);

        uint256 jurorActiveBalance = _getJurorActiveBalance(_juror, period.balanceCheckpoint);
        return _getJurorFees(period, _token, jurorActiveBalance, totalActiveBalance);
    }

    /**
    * @dev Tell the fees corresponding to a juror for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _juror Address of the juror querying the owed fees of
    * @param _tokens List of token addresses to be queried
    * @return List of token amounts corresponding to the juror
    */
    function getManyJurorFees(uint256 _periodId, address _juror, address[] calldata _tokens) external view returns (uint256[] memory amounts) {
        require(_periodId < _getCurrentPeriodId(), ERROR_NON_PAST_PERIOD);

        Period storage period = periods[_periodId];
        uint256 totalActiveBalance = period.totalActiveBalance;
        require(totalActiveBalance != 0, ERROR_PERIOD_BALANCE_DETAILS_NOT_COMPUTED);

        amounts = new uint256[](_tokens.length);
        uint256 jurorActiveBalance = _getJurorActiveBalance(_juror, period.balanceCheckpoint);
        for (uint256 i = 0; i < _tokens.length; i++) {
            amounts[i] = _getJurorFees(period, _tokens[i], jurorActiveBalance, totalActiveBalance);
        }
    }

    /**
    * @dev Check if a given juror has already claimed the owed fees for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _juror Address of the juror being queried
    * @param _token Address of the token to be queried
    * @return True if the juror has already claimed the corresponding token fees
    */
    function hasJurorClaimed(uint256 _periodId, address _juror, address _token) external view returns (bool) {
        Period storage period = periods[_periodId];
        return _hasClaimedJurorFees(period, _juror, _token);
    }

    /**
    * @dev Check if a given juror has already claimed the owed fees for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _juror Address of the juror being queried
    * @param _tokens List of token addresses to be queried
    * @return List of status to tell whether the corresponding token was claimed by the juror
    */
    function hasJurorClaimedMany(uint256 _periodId, address _juror, address[] calldata _tokens) external view returns (bool[] memory claimed) {
        Period storage period = periods[_periodId];

        claimed = new bool[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; i++) {
            claimed[i] = _hasClaimedJurorFees(period, _juror, _tokens[i]);
        }
    }

    /**
    * @dev Tell the fees corresponding to a juror for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _token Address of the token to be queried
    * @return Token amount corresponding to the governor
    */
    function getGovernorFees(uint256 _periodId, address _token) external view returns (uint256) {
        Period storage period = periods[_periodId];
        return period.governorFees[_token];
    }

    /**
    * @dev Tell the fees corresponding to a juror for a certain period
    * @param _periodId Identification number of the period being queried
    * @param _tokens List of token addresses to be queried
    * @return List of token amounts corresponding to the governor
    */
    function getManyGovernorFees(uint256 _periodId, address[] calldata _tokens) external view returns (uint256[] memory amounts) {
        Period storage period = periods[_periodId];

        amounts = new uint256[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; i++) {
            amounts[i] = _getGovernorFees(period, _tokens[i]);
        }
    }

    /**
    * @dev Internal function to claim juror fees for a certain period
    * @param _period Period being claimed
    * @param _periodId Identification number of the period claiming fees for
    * @param _juror Address of the juror claiming the fees
    * @param _token Address of the token being claimed
    * @param _amount Amount of tokens to be transferred to the juror
    */
    function _claimJurorFees(Period storage _period, uint256 _periodId, address payable _juror, address _token, uint256 _amount) internal {
        if (_amount > 0) {
            _period.claimedJurorFees[_juror][_token] = true;
            _transfer(_juror, _token, _amount);
            emit JurorFeesClaimed(_periodId, _juror, _token, _amount);
        }
    }

    /**
    * @dev Internal function to transfer governor fees for a certain period
    * @param _period Period being claimed
    * @param _periodId Identification number of the period being claimed
    * @param _token Address of the token to be claimed
    */
    function _transferGovernorFees(Period storage _period, uint256 _periodId, address payable _governor, address _token) internal {
        uint256 amount = _getGovernorFees(_period, _token);
        if (amount > 0) {
            _period.governorFees[_token] = 0;
            _transfer(_governor, _token, amount);
            emit GovernorFeesTransferred(_periodId, _token, amount);
        }
    }

    /**
    * @dev Internal function to pull tokens into this contract
    * @param _from Owner of the deposited funds
    * @param _token Address of the token to deposit
    * @param _amount Amount to be deposited
    */
    function _deposit(address _from, address _token, uint256 _amount) internal {
        if (_token == address(0)) {
            require(msg.value == _amount, ERROR_ETH_DEPOSIT_MISMATCH);
        } else {
            require(ERC20(_token).safeTransferFrom(_from, address(this), _amount), ERROR_TOKEN_DEPOSIT_FAILED);
        }
    }

    /**
    * @dev Internal function to transfer tokens
    * @param _to Recipient of the transfer
    * @param _token Address of the token to transfer
    * @param _amount Amount to be transferred
    */
    function _transfer(address payable _to, address _token, uint256 _amount) internal {
        if (_token == address(0)) {
            // solium-disable-next-line security/no-send
            require(_to.send(_amount), ERROR_ETH_TRANSFER_FAILED);
        } else {
            require(ERC20(_token).safeTransfer(_to, _amount), ERROR_TOKEN_TRANSFER_FAILED);
        }
    }

    /**
    * @dev Internal function to make sure that the balance details of a certain period have been computed. This function assumes given ID and
    *      period correspond to each other.
    * @param _periodId Identification number of the period being ensured
    * @param _period Period being ensured
    * @return Court term ID used to fetch the total active balance of the jurors registry
    * @return Total amount of juror tokens active in the Court at the corresponding used checkpoint
    */
    function _ensurePeriodBalanceDetails(Period storage _period, uint256 _periodId) internal returns (uint64, uint256) {
        // Shortcut if the period balance details were already set
        uint256 totalActiveBalance = _period.totalActiveBalance;
        if (totalActiveBalance != 0) {
            return (_period.balanceCheckpoint, totalActiveBalance);
        }

        uint64 periodStartTermId = _getPeriodStartTermId(_periodId);
        uint64 nextPeriodStartTermId = _getPeriodStartTermId(_periodId.add(1));

        // Pick a random Court term during the next period of the requested one to get the total amount of juror tokens active in the Court
        IClock clock = _clock();
        bytes32 randomness = clock.getTermRandomness(nextPeriodStartTermId);

        // The randomness factor for each Court term is computed using the the hash of a block number set during the initialization of the
        // term, to ensure it cannot be known beforehand. Note that the hash function being used only works for the 256 most recent block
        // numbers. Therefore, if that occurs we use the hash of the previous block number. This could be slightly beneficial for the first
        // juror calling this function, but it's still impossible to predict during the requested period.
        if (randomness == bytes32(0)) {
            randomness = blockhash(getBlockNumber() - 1);
        }

        // Use randomness to choose a Court term of the requested period and query the total amount of juror tokens active at that term
        IJurorsRegistry jurorsRegistry = _jurorsRegistry();
        uint64 periodBalanceCheckpoint = periodStartTermId.add(uint64(uint256(randomness) % periodDuration));
        totalActiveBalance = jurorsRegistry.totalActiveBalanceAt(periodBalanceCheckpoint);

        _period.balanceCheckpoint = periodBalanceCheckpoint;
        _period.totalActiveBalance = totalActiveBalance;
        return (periodBalanceCheckpoint, totalActiveBalance);
    }

    /**
    * @dev Internal function to set a new governor share value
    * @param _governorSharePct New permyriad of collected fees that will be allocated to the governor of the Court (‱ - 1/10,000)
    */
    function _setGovernorSharePct(uint16 _governorSharePct) internal {
        // Check governor share is not greater than 10,000‱
        require(PctHelpers.isValid(_governorSharePct), ERROR_OVERRATED_GOVERNOR_SHARE_PCT);

        emit GovernorSharePctChanged(governorSharePct, _governorSharePct);
        governorSharePct = _governorSharePct;
    }

    /**
    * @dev Internal function to tell the identification number of the current period
    * @return Identification number of the current period
    */
    function _getCurrentPeriodId() internal view returns (uint256) {
        // Since the Court starts at term #1, and the first payment period is #0, then subtract one unit to the current term of the Court
        uint64 termId = _getCurrentTermId();
        require(termId > 0, ERROR_COURT_HAS_NOT_STARTED);

        // No need for SafeMath: we already checked that the term ID is at least 1
        uint64 periodId = (termId - START_TERM_ID) / periodDuration;
        return uint256(periodId);
    }

    /**
    * @dev Internal function to get the current period
    * @return periodId Identification number of the current period
    * @return period Current period instance
    */
    function _getCurrentPeriod() internal view returns (uint256 periodId, Period storage period) {
        periodId = _getCurrentPeriodId();
        period = periods[periodId];
    }

    /**
    * @dev Internal function to get the Court term in which a certain period starts
    * @param _periodId Identification number of the period querying the start term of
    * @return Court term where the given period starts
    */
    function _getPeriodStartTermId(uint256 _periodId) internal view returns (uint64) {
        // Periods are measured in Court terms. Since Court terms are represented in uint64, we are safe to use uint64 for period ids too.
        // We are using SafeMath here because if any user calls `getPeriodBalanceDetails` for a huge period ID,
        // it would overflow and therefore return wrong information.
        return START_TERM_ID.add(uint64(_periodId).mul(periodDuration));
    }

    /**
    * @dev Internal function to tell the active balance of a juror for a certain period
    * @param _juror Address of the juror querying the owed fees of
    * @param _periodBalanceCheckpoint Checkpoint of the period being queried
    * @return Active balance for a juror based on the period checkpoint
    */
    function _getJurorActiveBalance(address _juror, uint64 _periodBalanceCheckpoint) internal view returns (uint256) {
        IJurorsRegistry jurorsRegistry = _jurorsRegistry();
        return jurorsRegistry.activeBalanceOfAt(_juror, _periodBalanceCheckpoint);
    }

    /**
    * @dev Internal function to tell the fees corresponding to a juror for a certain period and token
    * @param _period Period being queried
    * @param _token Address of the token being queried
    * @param _jurorActiveBalance Active balance of a juror at the corresponding period checkpoint
    * @param _totalActiveBalance Total amount of juror tokens active in the Court at the corresponding period checkpoint
    * @return Amount of fees owed to the given juror for the requested period and token
    */
    function _getJurorFees(
        Period storage _period,
        address _token,
        uint256 _jurorActiveBalance,
        uint256 _totalActiveBalance
    )
        internal
        view
        returns (uint256)
    {
        if (_jurorActiveBalance == 0) {
            return 0;
        }

        // Note that we already checked the juror active balance is greater than zero.
        // Then, the total active balance must be greater than zero.
        return _period.jurorFees[_token].mul(_jurorActiveBalance) / _totalActiveBalance;
    }

    /**
    * @dev Check if a given juror has already claimed the owed fees for a certain period
    * @param _period Period being queried
    * @param _juror Address of the juror being queried
    * @param _token Address of the token to be queried
    * @return True if the juror has already claimed the corresponding token fees
    */
    function _hasClaimedJurorFees(Period storage _period, address _juror, address _token) internal view returns (bool) {
        return _period.claimedJurorFees[_juror][_token];
    }

    /**
    * @dev Tell the fees corresponding to a juror for a certain period
    * @param _period Period being queried
    * @param _token Address of the token to be queried
    * @return Token amount corresponding to the governor
    */
    function _getGovernorFees(Period storage _period, address _token) internal view returns (uint256) {
        return _period.governorFees[_token];
    }
}
