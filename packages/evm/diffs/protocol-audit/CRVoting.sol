// File: contracts/arbitration/IArbitrator.sol
// Omitted -- see AragonProtocol

// File: contracts/arbitration/IArbitrable.sol
// Omitted -- see AragonProtocol

// File: contracts/core/clock/IClock.sol
// Omitted -- see AragonProtocol

// File: contracts/core/clock/ProtocolClock.sol
// Omitted -- see AragonProtocol

// File: contracts/core/config/IConfig.sol
// Omitted -- see AragonProtocol

// File: contracts/core/config/ProtocolConfigData.sol
// Omitted -- see AragonProtocol

// File: contracts/core/config/ProtocolConfig.sol
// Omitted -- see AragonProtocol

// File: contracts/core/modules/ACL.sol
// Omitted -- see AragonProtocol

// File: contracts/core/modules/Controller.sol
// Omitted -- see AragonProtocol

// File: contracts/core/config/ConfigConsumer.sol
// Omitted -- see AragonProtocol

// File: contracts/lib/math/SafeMath.sol

// Brought from https://github.com/aragon/aragonOS/blob/v4.3.0/contracts/lib/math/SafeMath.sol
// Adapted to use pragma ^0.5.17 and satisfy our linter rules

pragma solidity >=0.4.24 <0.6.0;


/**
 * @title SafeMath
 * @dev Math operations with safety checks that revert on error
 */
library SafeMath {
    string private constant ERROR_ADD_OVERFLOW = "MATH_ADD_OVERFLOW";
    string private constant ERROR_SUB_UNDERFLOW = "MATH_SUB_UNDERFLOW";
    string private constant ERROR_MUL_OVERFLOW = "MATH_MUL_OVERFLOW";
    string private constant ERROR_DIV_ZERO = "MATH_DIV_ZERO";

    /**
    * @dev Multiplies two numbers, reverts on overflow.
    */
    function mul(uint256 _a, uint256 _b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-solidity/pull/522
        if (_a == 0) {
            return 0;
        }

        uint256 c = _a * _b;
        require(c / _a == _b, ERROR_MUL_OVERFLOW);

        return c;
    }

    /**
    * @dev Integer division of two numbers truncating the quotient, reverts on division by zero.
    */
    function div(uint256 _a, uint256 _b) internal pure returns (uint256) {
        require(_b > 0, ERROR_DIV_ZERO); // Solidity only automatically asserts when dividing by 0
        uint256 c = _a / _b;
        // assert(_a == _b * c + _a % _b); // There is no case in which this doesn't hold

        return c;
    }

    /**
    * @dev Subtracts two numbers, reverts on overflow (i.e. if subtrahend is greater than minuend).
    */
    function sub(uint256 _a, uint256 _b) internal pure returns (uint256) {
        require(_b <= _a, ERROR_SUB_UNDERFLOW);
        uint256 c = _a - _b;

        return c;
    }

    /**
    * @dev Adds two numbers, reverts on overflow.
    */
    function add(uint256 _a, uint256 _b) internal pure returns (uint256) {
        uint256 c = _a + _b;
        require(c >= _a, ERROR_ADD_OVERFLOW);

        return c;
    }

    /**
    * @dev Divides two numbers and returns the remainder (unsigned integer modulo),
    * reverts when dividing by zero.
    */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, ERROR_DIV_ZERO);
        return a % b;
    }
}

// File: contracts/voting/ICRVotingOwner.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;


interface ICRVotingOwner {
    /**
    * @dev Ensure votes can be committed for a vote instance, revert otherwise
    * @param _voteId ID of the vote instance to request the weight of a voter for
    */
    function ensureCanCommit(uint256 _voteId) external;

    /**
    * @dev Ensure a certain voter can commit votes for a vote instance, revert otherwise
    * @param _voteId ID of the vote instance to request the weight of a voter for
    * @param _voter Address of the voter querying the weight of
    */
    function ensureCanCommit(uint256 _voteId, address _voter) external;

    /**
    * @dev Ensure a certain voter can reveal votes for vote instance, revert otherwise
    * @param _voteId ID of the vote instance to request the weight of a voter for
    * @param _voter Address of the voter querying the weight of
    * @return Weight of the requested guardian for the requested vote instance
    */
    function ensureCanReveal(uint256 _voteId, address _voter) external returns (uint64);
}

// File: contracts/voting/ICRVoting.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;



interface ICRVoting {
    /**
    * @dev Create a new vote instance
    * @dev This function can only be called by the CRVoting owner
    * @param _voteId ID of the new vote instance to be created
    * @param _possibleOutcomes Number of possible outcomes for the new vote instance to be created
    */
    function createVote(uint256 _voteId, uint8 _possibleOutcomes) external;

    /**
    * @dev Get the winning outcome of a vote instance
    * @param _voteId ID of the vote instance querying the winning outcome of
    * @return Winning outcome of the given vote instance or refused in case it's missing
    */
    function getWinningOutcome(uint256 _voteId) external view returns (uint8);

    /**
    * @dev Get the tally of an outcome for a certain vote instance
    * @param _voteId ID of the vote instance querying the tally of
    * @param _outcome Outcome querying the tally of
    * @return Tally of the outcome being queried for the given vote instance
    */
    function getOutcomeTally(uint256 _voteId, uint8 _outcome) external view returns (uint256);

    /**
    * @dev Tell whether an outcome is valid for a given vote instance or not
    * @param _voteId ID of the vote instance to check the outcome of
    * @param _outcome Outcome to check if valid or not
    * @return True if the given outcome is valid for the requested vote instance, false otherwise
    */
    function isValidOutcome(uint256 _voteId, uint8 _outcome) external view returns (bool);

    /**
    * @dev Get the outcome voted by a voter for a certain vote instance
    * @param _voteId ID of the vote instance querying the outcome of
    * @param _voter Address of the voter querying the outcome of
    * @return Outcome of the voter for the given vote instance
    */
    function getVoterOutcome(uint256 _voteId, address _voter) external view returns (uint8);

    /**
    * @dev Tell whether a voter voted in favor of a certain outcome in a vote instance or not
    * @param _voteId ID of the vote instance to query if a voter voted in favor of a certain outcome
    * @param _outcome Outcome to query if the given voter voted in favor of
    * @param _voter Address of the voter to query if voted in favor of the given outcome
    * @return True if the given voter voted in favor of the given outcome, false otherwise
    */
    function hasVotedInFavorOf(uint256 _voteId, uint8 _outcome, address _voter) external view returns (bool);

    /**
    * @dev Filter a list of voters based on whether they voted in favor of a certain outcome in a vote instance or not
    * @param _voteId ID of the vote instance to be checked
    * @param _outcome Outcome to filter the list of voters of
    * @param _voters List of addresses of the voters to be filtered
    * @return List of results to tell whether a voter voted in favor of the given outcome or not
    */
    function getVotersInFavorOf(uint256 _voteId, uint8 _outcome, address[] calldata _voters) external view returns (bool[] memory);
}

// File: contracts/lib/utils/IsContract.sol

// Brought from https://github.com/aragon/aragonOS/blob/v4.3.0/contracts/common/IsContract.sol
// Adapted to use pragma ^0.5.17 and satisfy our linter rules

pragma solidity ^0.5.17;


contract IsContract {
    /*
    * NOTE: this should NEVER be used for authentication
    * (see pitfalls: https://github.com/fergarrui/ethereum-security/tree/master/contracts/extcodesize).
    *
    * This is only intended to be used as a sanity check that an address is actually a contract,
    * RATHER THAN an address not being a contract.
    */
    function isContract(address _target) internal view returns (bool) {
        if (_target == address(0)) {
            return false;
        }

        uint256 size;
        assembly { size := extcodesize(_target) }
        return size > 0;
    }
}

// File: contracts/core/modules/ModuleIds.sol

pragma solidity ^0.5.17;


contract ModuleIds {
    // DisputeManager module ID - keccak256(abi.encodePacked("DISPUTE_MANAGER"))
    bytes32 internal constant MODULE_ID_DISPUTE_MANAGER = 0x14a6c70f0f6d449c014c7bbc9e68e31e79e8474fb03b7194df83109a2d888ae6;

    // GuardiansRegistry module ID - keccak256(abi.encodePacked("GUARDIANS_REGISTRY"))
    bytes32 internal constant MODULE_ID_GUARDIANS_REGISTRY = 0x8af7b7118de65da3b974a3fd4b0c702b66442f74b9dff6eaed1037254c0b79fe;

    // Voting module ID - keccak256(abi.encodePacked("VOTING"))
    bytes32 internal constant MODULE_ID_VOTING = 0x7cbb12e82a6d63ff16fe43977f43e3e2b247ecd4e62c0e340da8800a48c67346;

    // PaymentsBook module ID - keccak256(abi.encodePacked("PAYMENTS_BOOK"))
    bytes32 internal constant MODULE_ID_PAYMENTS_BOOK = 0xfa275b1417437a2a2ea8e91e9fe73c28eaf0a28532a250541da5ac0d1892b418;

    // Treasury module ID - keccak256(abi.encodePacked("TREASURY"))
    bytes32 internal constant MODULE_ID_TREASURY = 0x06aa03964db1f7257357ef09714a5f0ca3633723df419e97015e0c7a3e83edb7;
}

// File: contracts/core/modules/IModulesLinker.sol

pragma solidity ^0.5.17;


interface IModulesLinker {
    /**
    * @notice Update the implementations of a list of modules
    * @param _ids List of IDs of the modules to be updated
    * @param _addresses List of module addresses to be updated
    */
    function linkModules(bytes32[] calldata _ids, address[] calldata _addresses) external;
}

// File: contracts/lib/math/SafeMath64.sol

// Brought from https://github.com/aragon/aragonOS/blob/v4.3.0/contracts/lib/math/SafeMath64.sol
// Adapted to use pragma ^0.5.17 and satisfy our linter rules

pragma solidity ^0.5.17;


/**
 * @title SafeMath64
 * @dev Math operations for uint64 with safety checks that revert on error
 */
library SafeMath64 {
    string private constant ERROR_ADD_OVERFLOW = "MATH64_ADD_OVERFLOW";
    string private constant ERROR_SUB_UNDERFLOW = "MATH64_SUB_UNDERFLOW";
    string private constant ERROR_MUL_OVERFLOW = "MATH64_MUL_OVERFLOW";
    string private constant ERROR_DIV_ZERO = "MATH64_DIV_ZERO";

    /**
    * @dev Multiplies two numbers, reverts on overflow.
    */
    function mul(uint64 _a, uint64 _b) internal pure returns (uint64) {
        uint256 c = uint256(_a) * uint256(_b);
        require(c < 0x010000000000000000, ERROR_MUL_OVERFLOW); // 2**64 (less gas this way)

        return uint64(c);
    }

    /**
    * @dev Integer division of two numbers truncating the quotient, reverts on division by zero.
    */
    function div(uint64 _a, uint64 _b) internal pure returns (uint64) {
        require(_b > 0, ERROR_DIV_ZERO); // Solidity only automatically asserts when dividing by 0
        uint64 c = _a / _b;
        // assert(_a == _b * c + _a % _b); // There is no case in which this doesn't hold

        return c;
    }

    /**
    * @dev Subtracts two numbers, reverts on overflow (i.e. if subtrahend is greater than minuend).
    */
    function sub(uint64 _a, uint64 _b) internal pure returns (uint64) {
        require(_b <= _a, ERROR_SUB_UNDERFLOW);
        uint64 c = _a - _b;

        return c;
    }

    /**
    * @dev Adds two numbers, reverts on overflow.
    */
    function add(uint64 _a, uint64 _b) internal pure returns (uint64) {
        uint64 c = _a + _b;
        require(c >= _a, ERROR_ADD_OVERFLOW);

        return c;
    }

    /**
    * @dev Divides two numbers and returns the remainder (unsigned integer modulo),
    * reverts when dividing by zero.
    */
    function mod(uint64 a, uint64 b) internal pure returns (uint64) {
        require(b != 0, ERROR_DIV_ZERO);
        return a % b;
    }
}

// File: contracts/lib/utils/Uint256Helpers.sol

// Brought from https://github.com/aragon/aragonOS/blob/v4.3.0/contracts/common/Uint256Helpers.sol
// Adapted to use pragma ^0.5.17 and satisfy our linter rules

pragma solidity ^0.5.17;


library Uint256Helpers {
    uint256 private constant MAX_UINT8 = uint8(-1);
    uint256 private constant MAX_UINT64 = uint64(-1);

    string private constant ERROR_UINT8_NUMBER_TOO_BIG = "UINT8_NUMBER_TOO_BIG";
    string private constant ERROR_UINT64_NUMBER_TOO_BIG = "UINT64_NUMBER_TOO_BIG";

    function toUint8(uint256 a) internal pure returns (uint8) {
        require(a <= MAX_UINT8, ERROR_UINT8_NUMBER_TOO_BIG);
        return uint8(a);
    }

    function toUint64(uint256 a) internal pure returns (uint64) {
        require(a <= MAX_UINT64, ERROR_UINT64_NUMBER_TOO_BIG);
        return uint64(a);
    }
}

// File: contracts/lib/utils/TimeHelpers.sol

// Brought from https://github.com/aragon/aragonOS/blob/v4.3.0/contracts/common/TimeHelpers.sol
// Adapted to use pragma ^0.5.17 and satisfy our linter rules

pragma solidity ^0.5.17;



contract TimeHelpers {
    using Uint256Helpers for uint256;

    /**
    * @dev Returns the current block number.
    *      Using a function rather than `block.number` allows us to easily mock the block number in
    *      tests.
    */
    function getBlockNumber() internal view returns (uint256) {
        return block.number;
    }

    /**
    * @dev Returns the current block number, converted to uint64.
    *      Using a function rather than `block.number` allows us to easily mock the block number in
    *      tests.
    */
    function getBlockNumber64() internal view returns (uint64) {
        return getBlockNumber().toUint64();
    }

    /**
    * @dev Returns the current timestamp.
    *      Using a function rather than `block.timestamp` allows us to easily mock it in
    *      tests.
    */
    function getTimestamp() internal view returns (uint256) {
        return block.timestamp; // solium-disable-line security/no-block-members
    }

    /**
    * @dev Returns the current timestamp, converted to uint64.
    *      Using a function rather than `block.timestamp` allows us to easily mock it in
    *      tests.
    */
    function getTimestamp64() internal view returns (uint64) {
        return getTimestamp().toUint64();
    }
}

// File: contracts/lib/standards/IERC20.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;


/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
contract IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);

    function balanceOf(address _who) external view returns (uint256);

    function allowance(address _owner, address _spender) external view returns (uint256);

    function transfer(address _to, uint256 _value) external returns (bool);

    function approve(address _spender, uint256 _value) external returns (bool);

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
}

// File: contracts/lib/utils/PctHelpers.sol

pragma solidity ^0.5.17;



library PctHelpers {
    using SafeMath for uint256;

    uint256 internal constant PCT_BASE = 10000; // ‱ (1 / 10,000)

    function isValid(uint16 _pct) internal pure returns (bool) {
        return _pct <= PCT_BASE;
    }

    function pct(uint256 self, uint16 _pct) internal pure returns (uint256) {
        return self.mul(uint256(_pct)) / PCT_BASE;
    }

    function pct256(uint256 self, uint256 _pct) internal pure returns (uint256) {
        return self.mul(_pct) / PCT_BASE;
    }

    function pctIncrease(uint256 self, uint16 _pct) internal pure returns (uint256) {
        // No need for SafeMath: for addition note that `PCT_BASE` is lower than (2^256 - 2^16)
        return self.mul(PCT_BASE + uint256(_pct)) / PCT_BASE;
    }
}

// File: contracts/treasury/ITreasury.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;



interface ITreasury {
    /**
    * @dev Assign a certain amount of tokens to an account
    * @param _token ERC20 token to be assigned
    * @param _to Address of the recipient that will be assigned the tokens to
    * @param _amount Amount of tokens to be assigned to the recipient
    */
    function assign(IERC20 _token, address _to, uint256 _amount) external;

    /**
    * @dev Withdraw a certain amount of tokens
    * @param _token ERC20 token to be withdrawn
    * @param _from Address withdrawing the tokens from
    * @param _to Address of the recipient that will receive the tokens
    * @param _amount Amount of tokens to be withdrawn from the sender
    */
    function withdraw(IERC20 _token, address _from, address _to, uint256 _amount) external;
}

// File: contracts/registry/IGuardiansRegistry.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;



interface IGuardiansRegistry {

    /**
    * @dev Assign a requested amount of guardian tokens to a guardian
    * @param _guardian Guardian to add an amount of tokens to
    * @param _amount Amount of tokens to be added to the available balance of a guardian
    */
    function assignTokens(address _guardian, uint256 _amount) external;

    /**
    * @dev Burn a requested amount of guardian tokens
    * @param _amount Amount of tokens to be burned
    */
    function burnTokens(uint256 _amount) external;

    /**
    * @dev Draft a set of guardians based on given requirements for a term id
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
    function draft(uint256[7] calldata _params) external returns (address[] memory guardians, uint256 length);

    /**
    * @dev Slash a set of guardians based on their votes compared to the winning ruling
    * @param _termId Current term id
    * @param _guardians List of guardian addresses to be slashed
    * @param _lockedAmounts List of amounts locked for each corresponding guardian that will be either slashed or returned
    * @param _rewardedGuardians List of booleans to tell whether a guardian's active balance has to be slashed or not
    * @return Total amount of slashed tokens
    */
    function slashOrUnlock(uint64 _termId, address[] calldata _guardians, uint256[] calldata _lockedAmounts, bool[] calldata _rewardedGuardians)
        external
        returns (uint256 collectedTokens);

    /**
    * @dev Try to collect a certain amount of tokens from a guardian for the next term
    * @param _guardian Guardian to collect the tokens from
    * @param _amount Amount of tokens to be collected from the given guardian and for the requested term id
    * @param _termId Current term id
    * @return True if the guardian has enough unlocked tokens to be collected for the requested term, false otherwise
    */
    function collectTokens(address _guardian, uint256 _amount, uint64 _termId) external returns (bool);

    /**
    * @dev Lock a guardian's withdrawals until a certain term ID
    * @param _guardian Address of the guardian to be locked
    * @param _termId Term ID until which the guardian's withdrawals will be locked
    */
    function lockWithdrawals(address _guardian, uint64 _termId) external;

    /**
    * @dev Tell the active balance of a guardian for a given term id
    * @param _guardian Address of the guardian querying the active balance of
    * @param _termId Term ID querying the active balance for
    * @return Amount of active tokens for guardian in the requested past term id
    */
    function activeBalanceOfAt(address _guardian, uint64 _termId) external view returns (uint256);

    /**
    * @dev Tell the total amount of active guardian tokens at the given term id
    * @param _termId Term ID querying the total active balance for
    * @return Total amount of active guardian tokens at the given term id
    */
    function totalActiveBalanceAt(uint64 _termId) external view returns (uint256);
}

// File: contracts/disputes/IDisputeManager.sol

pragma solidity ^0.5.17;




interface IDisputeManager {
    enum DisputeState {
        PreDraft,
        Adjudicating,
        Ruled
    }

    enum AdjudicationState {
        Invalid,
        Committing,
        Revealing,
        Appealing,
        ConfirmingAppeal,
        Ended
    }

    /**
    * @dev Create a dispute to be drafted in a future term
    * @param _subject Arbitrable instance creating the dispute
    * @param _possibleRulings Number of possible rulings allowed for the drafted guardians to vote on the dispute
    * @param _metadata Optional metadata that can be used to provide additional information on the dispute to be created
    * @return Dispute identification number
    */
    function createDispute(IArbitrable _subject, uint8 _possibleRulings, bytes calldata _metadata) external returns (uint256);

    /**
    * @dev Submit evidence for a dispute
    * @param _subject Arbitrable instance submitting the dispute
    * @param _disputeId Identification number of the dispute receiving new evidence
    * @param _submitter Address of the account submitting the evidence
    * @param _evidence Data submitted for the evidence of the dispute
    */
    function submitEvidence(IArbitrable _subject, uint256 _disputeId, address _submitter, bytes calldata _evidence) external;

    /**
    * @dev Close the evidence period of a dispute
    * @param _subject IArbitrable instance requesting to close the evidence submission period
    * @param _disputeId Identification number of the dispute to close its evidence submitting period
    */
    function closeEvidencePeriod(IArbitrable _subject, uint256 _disputeId) external;

    /**
    * @dev Draft guardians for the next round of a dispute
    * @param _disputeId Identification number of the dispute to be drafted
    */
    function draft(uint256 _disputeId) external;

    /**
    * @dev Appeal round of a dispute in favor of a certain ruling
    * @param _disputeId Identification number of the dispute being appealed
    * @param _roundId Identification number of the dispute round being appealed
    * @param _ruling Ruling appealing a dispute round in favor of
    */
    function createAppeal(uint256 _disputeId, uint256 _roundId, uint8 _ruling) external;

    /**
    * @dev Confirm appeal for a round of a dispute in favor of a ruling
    * @param _disputeId Identification number of the dispute confirming an appeal of
    * @param _roundId Identification number of the dispute round confirming an appeal of
    * @param _ruling Ruling being confirmed against a dispute round appeal
    */
    function confirmAppeal(uint256 _disputeId, uint256 _roundId, uint8 _ruling) external;

    /**
    * @dev Compute the final ruling for a dispute
    * @param _disputeId Identification number of the dispute to compute its final ruling
    * @return subject Arbitrable instance associated to the dispute
    * @return finalRuling Final ruling decided for the given dispute
    */
    function computeRuling(uint256 _disputeId) external returns (IArbitrable subject, uint8 finalRuling);

    /**
    * @dev Settle penalties for a round of a dispute
    * @param _disputeId Identification number of the dispute to settle penalties for
    * @param _roundId Identification number of the dispute round to settle penalties for
    * @param _guardiansToSettle Maximum number of guardians to be slashed in this call
    */
    function settlePenalties(uint256 _disputeId, uint256 _roundId, uint256 _guardiansToSettle) external;

    /**
    * @dev Claim rewards for a round of a dispute for guardian
    * @dev For regular rounds, it will only reward winning guardians
    * @param _disputeId Identification number of the dispute to settle rewards for
    * @param _roundId Identification number of the dispute round to settle rewards for
    * @param _guardian Address of the guardian to settle their rewards
    */
    function settleReward(uint256 _disputeId, uint256 _roundId, address _guardian) external;

    /**
    * @dev Settle appeal deposits for a round of a dispute
    * @param _disputeId Identification number of the dispute to settle appeal deposits for
    * @param _roundId Identification number of the dispute round to settle appeal deposits for
    */
    function settleAppealDeposit(uint256 _disputeId, uint256 _roundId) external;

    /**
    * @dev Tell the amount of token fees required to create a dispute
    * @return feeToken ERC20 token used for the fees
    * @return feeAmount Total amount of fees to be paid for a dispute at the given term
    */
    function getDisputeFees() external view returns (IERC20 feeToken, uint256 feeAmount);

    /**
    * @dev Tell information of a certain dispute
    * @param _disputeId Identification number of the dispute being queried
    * @return subject Arbitrable subject being disputed
    * @return possibleRulings Number of possible rulings allowed for the drafted guardians to vote on the dispute
    * @return state Current state of the dispute being queried: pre-draft, adjudicating, or ruled
    * @return finalRuling The winning ruling in case the dispute is finished
    * @return lastRoundId Identification number of the last round created for the dispute
    * @return createTermId Identification number of the term when the dispute was created
    */
    function getDispute(uint256 _disputeId) external view
        returns (IArbitrable subject, uint8 possibleRulings, DisputeState state, uint8 finalRuling, uint256 lastRoundId, uint64 createTermId);

    /**
    * @dev Tell information of a certain adjudication round
    * @param _disputeId Identification number of the dispute being queried
    * @param _roundId Identification number of the round being queried
    * @return draftTerm Term from which the requested round can be drafted
    * @return delayedTerms Number of terms the given round was delayed based on its requested draft term id
    * @return guardiansNumber Number of guardians requested for the round
    * @return selectedGuardians Number of guardians already selected for the requested round
    * @return settledPenalties Whether or not penalties have been settled for the requested round
    * @return collectedTokens Amount of guardian tokens that were collected from slashed guardians for the requested round
    * @return coherentGuardians Number of guardians that voted in favor of the final ruling in the requested round
    * @return state Adjudication state of the requested round
    */
    function getRound(uint256 _disputeId, uint256 _roundId) external view
        returns (
            uint64 draftTerm,
            uint64 delayedTerms,
            uint64 guardiansNumber,
            uint64 selectedGuardians,
            uint256 guardianFees,
            bool settledPenalties,
            uint256 collectedTokens,
            uint64 coherentGuardians,
            AdjudicationState state
        );

    /**
    * @dev Tell appeal-related information of a certain adjudication round
    * @param _disputeId Identification number of the dispute being queried
    * @param _roundId Identification number of the round being queried
    * @return maker Address of the account appealing the given round
    * @return appealedRuling Ruling confirmed by the appealer of the given round
    * @return taker Address of the account confirming the appeal of the given round
    * @return opposedRuling Ruling confirmed by the appeal taker of the given round
    */
    function getAppeal(uint256 _disputeId, uint256 _roundId) external view
        returns (address maker, uint64 appealedRuling, address taker, uint64 opposedRuling);

    /**
    * @dev Tell information related to the next round due to an appeal of a certain round given.
    * @param _disputeId Identification number of the dispute being queried
    * @param _roundId Identification number of the round requesting the appeal details of
    * @return nextRoundStartTerm Term ID from which the next round will start
    * @return nextRoundGuardiansNumber Guardians number for the next round
    * @return newDisputeState New state for the dispute associated to the given round after the appeal
    * @return feeToken ERC20 token used for the next round fees
    * @return guardianFees Total amount of fees to be distributed between the winning guardians of the next round
    * @return totalFees Total amount of fees for a regular round at the given term
    * @return appealDeposit Amount to be deposit of fees for a regular round at the given term
    * @return confirmAppealDeposit Total amount of fees for a regular round at the given term
    */
    function getNextRoundDetails(uint256 _disputeId, uint256 _roundId) external view
        returns (
            uint64 nextRoundStartTerm,
            uint64 nextRoundGuardiansNumber,
            DisputeState newDisputeState,
            IERC20 feeToken,
            uint256 totalFees,
            uint256 guardianFees,
            uint256 appealDeposit,
            uint256 confirmAppealDeposit
        );

    /**
    * @dev Tell guardian-related information of a certain adjudication round
    * @param _disputeId Identification number of the dispute being queried
    * @param _roundId Identification number of the round being queried
    * @param _guardian Address of the guardian being queried
    * @return weight Guardian weight drafted for the requested round
    * @return rewarded Whether or not the given guardian was rewarded based on the requested round
    */
    function getGuardian(uint256 _disputeId, uint256 _roundId, address _guardian) external view returns (uint64 weight, bool rewarded);
}

// File: contracts/payments/IPaymentsBook.sol

/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.5.17;


interface IPaymentsBook {
    /**
    * @dev Pay an amount of tokens
    * @param _token Address of the token being paid
    * @param _amount Amount of tokens being paid
    * @param _payer Address paying on behalf of
    * @param _data Optional data
    */
    function pay(address _token, uint256 _amount, address _payer, bytes calldata _data) external payable;
}

// File: contracts/core/modules/Controlled.sol

pragma solidity ^0.5.17;













contract Controlled is IModulesLinker, IsContract, ModuleIds, ConfigConsumer {
    string private constant ERROR_MODULE_NOT_SET = "CTD_MODULE_NOT_SET";
    string private constant ERROR_INVALID_MODULES_LINK_INPUT = "CTD_INVALID_MODULES_LINK_INPUT";
    string private constant ERROR_CONTROLLER_NOT_CONTRACT = "CTD_CONTROLLER_NOT_CONTRACT";
    string private constant ERROR_SENDER_NOT_ALLOWED = "CTD_SENDER_NOT_ALLOWED";
    string private constant ERROR_SENDER_NOT_CONTROLLER = "CTD_SENDER_NOT_CONTROLLER";
    string private constant ERROR_SENDER_NOT_CONFIG_GOVERNOR = "CTD_SENDER_NOT_CONFIG_GOVERNOR";
    string private constant ERROR_SENDER_NOT_ACTIVE_VOTING = "CTD_SENDER_NOT_ACTIVE_VOTING";
    string private constant ERROR_SENDER_NOT_ACTIVE_DISPUTE_MANAGER = "CTD_SEND_NOT_ACTIVE_DISPUTE_MGR";
    string private constant ERROR_SENDER_NOT_CURRENT_DISPUTE_MANAGER = "CTD_SEND_NOT_CURRENT_DISPUTE_MGR";

    // Address of the controller
    Controller public controller;

    // List of modules linked indexed by ID
    mapping (bytes32 => address) public linkedModules;

    event ModuleLinked(bytes32 id, address addr);

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
    * @dev Ensure the msg.sender is an active DisputeManager module
    */
    modifier onlyActiveDisputeManager() {
        require(controller.isActive(MODULE_ID_DISPUTE_MANAGER, msg.sender), ERROR_SENDER_NOT_ACTIVE_DISPUTE_MANAGER);
        _;
    }

    /**
    * @dev Ensure the msg.sender is the current DisputeManager module
    */
    modifier onlyCurrentDisputeManager() {
        (address addr, bool disabled) = controller.getDisputeManager();
        require(msg.sender == addr, ERROR_SENDER_NOT_CURRENT_DISPUTE_MANAGER);
        require(!disabled, ERROR_SENDER_NOT_ACTIVE_DISPUTE_MANAGER);
        _;
    }

    /**
    * @dev Ensure the msg.sender is an active Voting module
    */
    modifier onlyActiveVoting() {
        require(controller.isActive(MODULE_ID_VOTING, msg.sender), ERROR_SENDER_NOT_ACTIVE_VOTING);
        _;
    }

    /**
    * @dev This modifier will check that the sender is the user to act on behalf of or someone with the required permission
    * @param _user Address of the user to act on behalf of
    */
    modifier authenticateSender(address _user) {
        _authenticateSender(_user);
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
    * @notice Update the implementation links of a list of modules
    * @dev The controller is expected to ensure the given addresses are correct modules
    * @param _ids List of IDs of the modules to be updated
    * @param _addresses List of module addresses to be updated
    */
    function linkModules(bytes32[] calldata _ids, address[] calldata _addresses) external onlyController {
        require(_ids.length == _addresses.length, ERROR_INVALID_MODULES_LINK_INPUT);

        for (uint256 i = 0; i < _ids.length; i++) {
            linkedModules[_ids[i]] = _addresses[i];
            emit ModuleLinked(_ids[i], _addresses[i]);
        }
    }

    /**
    * @dev Internal function to ensure the Protocol term is up-to-date, it will try to update it if not
    * @return Identification number of the current Protocol term
    */
    function _ensureCurrentTerm() internal returns (uint64) {
        return _clock().ensureCurrentTerm();
    }

    /**
    * @dev Internal function to fetch the last ensured term ID of the Protocol
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
    * @dev Internal function to fetch the address of the DisputeManager module
    * @return Address of the DisputeManager module
    */
    function _disputeManager() internal view returns (IDisputeManager) {
        return IDisputeManager(_getLinkedModule(MODULE_ID_DISPUTE_MANAGER));
    }

    /**
    * @dev Internal function to fetch the address of the GuardianRegistry module implementation
    * @return Address of the GuardianRegistry module implementation
    */
    function _guardiansRegistry() internal view returns (IGuardiansRegistry) {
        return IGuardiansRegistry(_getLinkedModule(MODULE_ID_GUARDIANS_REGISTRY));
    }

    /**
    * @dev Internal function to fetch the address of the Voting module implementation
    * @return Address of the Voting module implementation
    */
    function _voting() internal view returns (ICRVoting) {
        return ICRVoting(_getLinkedModule(MODULE_ID_VOTING));
    }

    /**
    * @dev Internal function to fetch the address of the PaymentsBook module implementation
    * @return Address of the PaymentsBook module implementation
    */
    function _paymentsBook() internal view returns (IPaymentsBook) {
        return IPaymentsBook(_getLinkedModule(MODULE_ID_PAYMENTS_BOOK));
    }

    /**
    * @dev Internal function to fetch the address of the Treasury module implementation
    * @return Address of the Treasury module implementation
    */
    function _treasury() internal view returns (ITreasury) {
        return ITreasury(_getLinkedModule(MODULE_ID_TREASURY));
    }

    /**
    * @dev Internal function to tell the address linked for a module based on a given ID
    * @param _id ID of the module being queried
    * @return Linked address of the requested module
    */
    function _getLinkedModule(bytes32 _id) internal view returns (address) {
        address module = linkedModules[_id];
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
    function _protocolConfig() internal view returns (IConfig) {
        return IConfig(controller);
    }

    /**
    * @dev Ensure that the sender is the user to act on behalf of or someone with the required permission
    * @param _user Address of the user to act on behalf of
    */
    function _authenticateSender(address _user) internal view {
        require(_isSenderAllowed(_user), ERROR_SENDER_NOT_ALLOWED);
    }

    /**
    * @dev Tell whether the sender is the user to act on behalf of or someone with the required permission
    * @param _user Address of the user to act on behalf of
    * @return True if the sender is the user to act on behalf of or someone with the required permission, false otherwise
    */
    function _isSenderAllowed(address _user) internal view returns (bool) {
        return msg.sender == _user || _hasRole(msg.sender);
    }

    /**
    * @dev Tell whether an address holds the required permission to access the requested functionality
    * @param _addr Address being checked
    * @return True if the given address has the required permission to access the requested functionality, false otherwise
    */
    function _hasRole(address _addr) internal view returns (bool) {
        bytes32 roleId = keccak256(abi.encodePacked(address(this), msg.sig));
        return controller.hasRole(_addr, roleId);
    }
}

// File: contracts/voting/CRVoting.sol

pragma solidity ^0.5.17;







contract CRVoting is ICRVoting, Controlled {
    using SafeMath for uint256;

    string private constant ERROR_VOTE_ALREADY_EXISTS = "CRV_VOTE_ALREADY_EXISTS";
    string private constant ERROR_VOTE_DOES_NOT_EXIST = "CRV_VOTE_DOES_NOT_EXIST";
    string private constant ERROR_VOTE_ALREADY_COMMITTED = "CRV_VOTE_ALREADY_COMMITTED";
    string private constant ERROR_VOTE_ALREADY_REVEALED = "CRV_VOTE_ALREADY_REVEALED";
    string private constant ERROR_SENDER_NOT_DELEGATE = "CRV_SENDER_NOT_DELEGATE";
    string private constant ERROR_INVALID_OUTCOME = "CRV_INVALID_OUTCOME";
    string private constant ERROR_INVALID_OUTCOMES_AMOUNT = "CRV_INVALID_OUTCOMES_AMOUNT";
    string private constant ERROR_INVALID_COMMITMENT_SALT = "CRV_INVALID_COMMITMENT_SALT";

    // Outcome nr. 0 is used to denote a missing vote (default)
    uint8 internal constant OUTCOME_MISSING = uint8(0);
    // Outcome nr. 1 is used to denote a leaked vote
    uint8 internal constant OUTCOME_LEAKED = uint8(1);
    // Outcome nr. 2 is used to denote a refused vote
    uint8 internal constant OUTCOME_REFUSED = uint8(2);
    // Besides the options listed above, every vote instance must provide at least 2 outcomes
    uint8 internal constant MIN_POSSIBLE_OUTCOMES = uint8(2);
    // Max number of outcomes excluding the default ones
    uint8 internal constant MAX_POSSIBLE_OUTCOMES = uint8(-1) - 3;

    struct CastVote {
        bytes32 commitment;                         // Hash of the outcome casted by the voter
        uint8 outcome;                              // Outcome submitted by the voter
    }

    struct Vote {
        uint8 winningOutcome;                       // Outcome winner of a vote instance
        uint8 maxAllowedOutcome;                    // Highest outcome allowed for the vote instance
        mapping (address => CastVote) votes;        // Mapping of voters addresses to their casted votes
        mapping (uint8 => uint256) outcomesTally;   // Tally for each of the possible outcomes
    }

    // Vote records indexed by their ID
    mapping (uint256 => Vote) internal voteRecords;
    // Delegates indexed by principals
    mapping (address => address) internal delegates;

    event VotingCreated(uint256 indexed voteId, uint8 possibleOutcomes);
    event VoteCommitted(uint256 indexed voteId, address indexed voter, bytes32 commitment);
    event VoteRevealed(uint256 indexed voteId, address indexed voter, uint8 outcome);
    event VoteLeaked(uint256 indexed voteId, address indexed voter, uint8 outcome);
    event DelegateSet(address indexed voter, address delegate);

    /**
    * @dev Ensure a certain vote exists
    * @param _voteId ID of the vote instance to be checked
    */
    modifier voteExists(uint256 _voteId) {
        require(_existsVote(_voteId), ERROR_VOTE_DOES_NOT_EXIST);
        _;
    }

    /**
    * @dev Constructor function
    * @param _controller Address of the controller
    */
    constructor(Controller _controller) Controlled(_controller) public {
        // solium-disable-previous-line no-empty-blocks
    }

    /**
    * @notice Set `_delegate` as the delegate for `_voter`
    * @param _voter Address of the voter updating the delegate for
    * @param _delegate Address of the delegate to be set
    */
    function delegate(address _voter, address _delegate) external authenticateSender(_voter) {
        delegates[_voter] = _delegate;
        emit DelegateSet(_voter, _delegate);
    }

    /**
    * @notice Create a new vote instance with ID #`_voteId` and `_possibleOutcomes` possible outcomes
    * @dev This function can only be called by the CRVoting owner
    * @param _voteId ID of the new vote instance to be created
    * @param _possibleOutcomes Number of possible outcomes for the new vote instance to be created
    */
    function createVote(uint256 _voteId, uint8 _possibleOutcomes) external onlyCurrentDisputeManager {
        require(_possibleOutcomes >= MIN_POSSIBLE_OUTCOMES && _possibleOutcomes <= MAX_POSSIBLE_OUTCOMES, ERROR_INVALID_OUTCOMES_AMOUNT);
        require(!_existsVote(_voteId), ERROR_VOTE_ALREADY_EXISTS);

        // No need for SafeMath: we already checked the number of outcomes above
        Vote storage vote = voteRecords[_voteId];
        vote.maxAllowedOutcome = OUTCOME_REFUSED + _possibleOutcomes;
        emit VotingCreated(_voteId, _possibleOutcomes);
    }

    /**
    * @notice Commit a vote for `_voter` on vote #`_voteId`
    * @param _voteId ID of the vote instance to commit a vote to
    * @param _voter Address of the voter to commit a vote for
    * @param _commitment Hashed outcome to be stored for future reveal
    */
    function commit(uint256 _voteId, address _voter, bytes32 _commitment) external voteExists(_voteId) {
        bool isSenderAllowed = _isDelegateOf(_voter, msg.sender) || _isSenderAllowed(_voter);
        require(isSenderAllowed, ERROR_SENDER_NOT_DELEGATE);

        CastVote storage castVote = voteRecords[_voteId].votes[_voter];
        require(castVote.commitment == bytes32(0), ERROR_VOTE_ALREADY_COMMITTED);
        _ensureVoterCanCommit(_voteId, _voter);

        castVote.commitment = _commitment;
        emit VoteCommitted(_voteId, _voter, _commitment);
    }

    /**
    * @notice Leak `_outcome` vote of `_voter` for vote #`_voteId`
    * @param _voteId ID of the vote instance to leak a vote of
    * @param _voter Address of the voter to leak a vote of
    * @param _outcome Outcome leaked for the voter
    * @param _salt Salt to decrypt and validate the committed vote of the voter
    */
    function leak(uint256 _voteId, address _voter, uint8 _outcome, bytes32 _salt) external voteExists(_voteId) {
        CastVote storage castVote = voteRecords[_voteId].votes[_voter];
        _checkValidSalt(castVote, _outcome, _salt);
        _ensureCanCommit(_voteId);

        // There is no need to check if an outcome is valid if it was leaked.
        // Additionally, leaked votes are not considered for the tally.
        castVote.outcome = OUTCOME_LEAKED;
        emit VoteLeaked(_voteId, _voter, _outcome);
    }

    /**
    * @notice Reveal `_outcome` vote of `_voter` for vote #`_voteId`
    * @param _voteId ID of the vote instance to reveal a vote of
    * @param _voter Address of the voter to reveal a vote for
    * @param _outcome Outcome revealed by the voter
    * @param _salt Salt to decrypt and validate the committed vote of the voter
    */
    function reveal(uint256 _voteId, address _voter, uint8 _outcome, bytes32 _salt) external voteExists(_voteId) {
        Vote storage vote = voteRecords[_voteId];
        CastVote storage castVote = vote.votes[_voter];
        _checkValidSalt(castVote, _outcome, _salt);
        require(_isValidOutcome(vote, _outcome), ERROR_INVALID_OUTCOME);

        uint256 weight = _ensureVoterCanReveal(_voteId, _voter);

        castVote.outcome = _outcome;
        _updateTally(vote, _outcome, weight);
        emit VoteRevealed(_voteId, _voter, _outcome);
    }

    /**
    * @dev Tell if a delegate currently represents another voter
    * @param _voter Address of the principal being queried
    * @param _delegate Address of the delegate being queried
    * @return True if the given delegate currently represents the voter
    */
    function isDelegateOf(address _voter, address _delegate) external view returns (bool) {
        return _isDelegateOf(_voter, _delegate);
    }

    /**
    * @dev Get the maximum allowed outcome for a given vote instance
    * @param _voteId ID of the vote instance querying the max allowed outcome of
    * @return Max allowed outcome for the given vote instance
    */
    function getMaxAllowedOutcome(uint256 _voteId) external view voteExists(_voteId) returns (uint8) {
        Vote storage vote = voteRecords[_voteId];
        return vote.maxAllowedOutcome;
    }

    /**
    * @dev Get the winning outcome of a vote instance. If the winning outcome is missing, which means no one voted in
    *      the given vote instance, it will be considered refused.
    * @param _voteId ID of the vote instance querying the winning outcome of
    * @return Winning outcome of the given vote instance or refused in case it's missing
    */
    function getWinningOutcome(uint256 _voteId) external view voteExists(_voteId) returns (uint8) {
        Vote storage vote = voteRecords[_voteId];
        uint8 winningOutcome = vote.winningOutcome;
        return winningOutcome == OUTCOME_MISSING ? OUTCOME_REFUSED : winningOutcome;
    }

    /**
    * @dev Get the tally of an outcome for a certain vote instance
    * @param _voteId ID of the vote instance querying the tally of
    * @param _outcome Outcome querying the tally of
    * @return Tally of the outcome being queried for the given vote instance
    */
    function getOutcomeTally(uint256 _voteId, uint8 _outcome) external view voteExists(_voteId) returns (uint256) {
        Vote storage vote = voteRecords[_voteId];
        return vote.outcomesTally[_outcome];
    }

    /**
    * @dev Tell whether an outcome is valid for a given vote instance or not. Missing and leaked outcomes are not considered
    *      valid. The only valid outcomes are refused or any of the custom outcomes of the given vote instance.
    * @param _voteId ID of the vote instance to check the outcome of
    * @param _outcome Outcome to check if valid or not
    * @return True if the given outcome is valid for the requested vote instance, false otherwise.
    */
    function isValidOutcome(uint256 _voteId, uint8 _outcome) external view voteExists(_voteId) returns (bool) {
        Vote storage vote = voteRecords[_voteId];
        return _isValidOutcome(vote, _outcome);
    }

    /**
    * @dev Get the outcome voted by a voter for a certain vote instance
    * @param _voteId ID of the vote instance querying the outcome of
    * @param _voter Address of the voter querying the outcome of
    * @return Outcome of the voter for the given vote instance
    */
    function getVoterOutcome(uint256 _voteId, address _voter) external view voteExists(_voteId) returns (uint8) {
        Vote storage vote = voteRecords[_voteId];
        return vote.votes[_voter].outcome;
    }

    /**
    * @dev Tell whether a voter voted in favor of a certain outcome in a vote instance or not.
    * @param _voteId ID of the vote instance to query if a voter voted in favor of a certain outcome
    * @param _outcome Outcome to query if the given voter voted in favor of
    * @param _voter Address of the voter to query if voted in favor of the given outcome
    * @return True if the given voter voted in favor of the given outcome, false otherwise
    */
    function hasVotedInFavorOf(uint256 _voteId, uint8 _outcome, address _voter) external view voteExists(_voteId) returns (bool) {
        Vote storage vote = voteRecords[_voteId];
        return vote.votes[_voter].outcome == _outcome;
    }

    /**
    * @dev Filter a list of voters based on whether they voted in favor of a certain outcome in a vote instance or not.
    *      Note that if there was no winning outcome, it means that no one voted, then all voters will be considered
    *      voting against any of the given outcomes.
    * @param _voteId ID of the vote instance to be checked
    * @param _outcome Outcome to filter the list of voters of
    * @param _voters List of addresses of the voters to be filtered
    * @return List of results to tell whether a voter voted in favor of the given outcome or not
    */
    function getVotersInFavorOf(uint256 _voteId, uint8 _outcome, address[] calldata _voters) external view voteExists(_voteId)
        returns (bool[] memory)
    {
        Vote storage vote = voteRecords[_voteId];
        bool[] memory votersInFavor = new bool[](_voters.length);

        // If there was a winning outcome, filter those voters that voted in favor of the given outcome.
        for (uint256 i = 0; i < _voters.length; i++) {
            votersInFavor[i] = _outcome == vote.votes[_voters[i]].outcome;
        }
        return votersInFavor;
    }

    /**
    * @dev Hash a vote outcome using a given salt
    * @param _outcome Outcome to be hashed
    * @param _salt Encryption salt
    * @return Hashed outcome
    */
    function hashVote(uint8 _outcome, bytes32 _salt) external pure returns (bytes32) {
        return _hashVote(_outcome, _salt);
    }

    /**
    * @dev Internal function to ensure votes can be committed for a vote
    * @param _voteId ID of the vote instance to be checked
    */
    function _ensureCanCommit(uint256 _voteId) internal {
        ICRVotingOwner owner = _votingOwner();
        owner.ensureCanCommit(_voteId);
    }

    /**
    * @dev Internal function to ensure a voter can commit votes
    * @param _voteId ID of the vote instance to be checked
    * @param _voter Address of the voter willing to commit a vote
    */
    function _ensureVoterCanCommit(uint256 _voteId, address _voter) internal {
        ICRVotingOwner owner = _votingOwner();
        owner.ensureCanCommit(_voteId, _voter);
    }

    /**
    * @dev Internal function to ensure a voter can reveal votes
    * @param _voteId ID of the vote instance to be checked
    * @param _voter Address of the voter willing to reveal a vote
    * @return Weight of the voter willing to reveal a vote
    */
    function _ensureVoterCanReveal(uint256 _voteId, address _voter) internal returns (uint256) {
        // There's no need to check voter weight, as this was done on commit
        ICRVotingOwner owner = _votingOwner();
        uint64 weight = owner.ensureCanReveal(_voteId, _voter);
        return uint256(weight);
    }

    /**
    * @dev Internal function to fetch the address of the Voting module's owner
    * @return Address of the Voting module's owner
    */
    function _votingOwner() internal view returns (ICRVotingOwner) {
        return ICRVotingOwner(address(_disputeManager()));
    }

    /**
    * @dev Internal function to check if a vote can be revealed for the given outcome and salt
    * @param _castVote Cast vote to be revealed
    * @param _outcome Outcome of the cast vote to be proved
    * @param _salt Salt to decrypt and validate the provided outcome for a cast vote
    */
    function _checkValidSalt(CastVote storage _castVote, uint8 _outcome, bytes32 _salt) internal view {
        require(_castVote.outcome == OUTCOME_MISSING, ERROR_VOTE_ALREADY_REVEALED);
        require(_castVote.commitment == _hashVote(_outcome, _salt), ERROR_INVALID_COMMITMENT_SALT);
    }

    /**
    * @dev Internal function to tell whether a certain outcome is valid for a given vote instance or not. Note that
    *      the missing and leaked outcomes are not considered valid. The only outcomes considered valid are refused
    *      or any of the possible outcomes of the given vote instance. This function assumes the given vote exists.
    * @param _vote Vote instance to check the outcome of
    * @param _outcome Outcome to check if valid or not
    * @return True if the given outcome is valid for the requested vote instance, false otherwise.
    */
    function _isValidOutcome(Vote storage _vote, uint8 _outcome) internal view returns (bool) {
        return _outcome >= OUTCOME_REFUSED && _outcome <= _vote.maxAllowedOutcome;
    }

    /**
    * @dev Internal function to check if a vote instance was already created
    * @param _voteId ID of the vote instance to be checked
    * @return True if the given vote instance was already created, false otherwise
    */
    function _existsVote(uint256 _voteId) internal view returns (bool) {
        Vote storage vote = voteRecords[_voteId];
        return vote.maxAllowedOutcome != OUTCOME_MISSING;
    }

    /**
    * @dev Tell if a delegates represents another voter
    * @param _voter Address of the principal being queried
    * @param _delegate Address of the delegate being queried
    * @return True if the given delegate currently represents the voter
    */
    function _isDelegateOf(address _voter, address _delegate) internal view returns (bool) {
        return _voter == _delegate || delegates[_voter] == _delegate;
    }

    /**
    * @dev Internal function to hash a vote outcome using a given salt
    * @param _outcome Outcome to be hashed
    * @param _salt Encryption salt
    * @return Hashed outcome
    */
    function _hashVote(uint8 _outcome, bytes32 _salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_outcome, _salt));
    }

    /**
    * @dev Tell chain ID
    * @return chainId Chain ID
    */
    function _chainId() internal pure returns (uint256 chainId) {
        assembly { chainId := chainid() }
    }

    /**
    * @dev Private function to update the tally of a given vote instance based on a new weight in favor of an outcome.
    *      This function assumes the vote instance exists.
    * @param _vote Vote instance to update the tally of
    * @param _outcome Outcome of the vote instance to update the tally of
    * @param _weight Weight to be added to the given outcome of the vote instance
    */
    function _updateTally(Vote storage _vote, uint8 _outcome, uint256 _weight) private {
        // Check if the given outcome is valid. Missing and leaked votes are ignored for the tally.
        if (!_isValidOutcome(_vote, _outcome)) {
            return;
        }

        uint256 newOutcomeTally = _vote.outcomesTally[_outcome].add(_weight);
        _vote.outcomesTally[_outcome] = newOutcomeTally;

        // Update the winning outcome only if its support was passed or if the given outcome represents a lowest
        // option than the winning outcome in case of a tie.
        uint8 winningOutcome = _vote.winningOutcome;
        uint256 winningOutcomeTally = _vote.outcomesTally[winningOutcome];
        if (newOutcomeTally > winningOutcomeTally || (newOutcomeTally == winningOutcomeTally && _outcome < winningOutcome)) {
            _vote.winningOutcome = _outcome;
        }
    }
}
