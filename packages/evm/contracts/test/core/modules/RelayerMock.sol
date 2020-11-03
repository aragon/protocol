pragma solidity ^0.5.17;

import "../../lib/TimeHelpersMock.sol";
import "../../../core/modules/SignaturesValidatorRelayer.sol";


contract RelayerMock is SignaturesValidatorRelayer, TimeHelpersMock {}
