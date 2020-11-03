pragma solidity ^0.5.17;

import "../../lib/utils/TimeHelpers.sol";


contract SignaturesValidatorRelayer is TimeHelpers {
    string private constant ERROR_INVALID_SIGNATURE = "SV_INVALID_SIGNATURE";

    // deadline + [r,s,v] signature
    uint256 internal constant EXTRA_CALLDATA_LENGTH = 32 * 3 + 1;
    // bytes32 private constant EIP712DOMAIN_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 internal constant EIP712DOMAIN_HASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    // bytes32 private constant NAME_HASH = keccak256("Aragon Protocol")
    bytes32 internal constant NAME_HASH = 0xa0d9e49a5b2f7cb3ade18ca4d0e001fa655c6d026766aba753a8b0f12201bc51;
    // bytes32 private constant VERSION_HASH = keccak256("1")
    bytes32 internal constant VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    mapping (address => uint256) internal nextNonce;

    /**
    * @notice Relay transaction from `_user` to `_target` with data `_data`
    * @param _target Address forwarding the call to
    * @param _user Address sending the call on behalf of
    * @param _data Arbitrary data to be included in the call
    * @param _deadline Encoded due date for the given signature
    * @param _v V component of the signature authorizing the sender to execute this transaction
    * @param _r R component of the signature authorizing the sender to execute this transaction
    * @param _s S component of the signature authorizing the sender to execute this transaction
    */
    function relay(address _target, address _user, bytes calldata _data, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s)
        external
    {
        // TODO: support payable relays
        bytes memory data = _data;
        require(_isSignatureValid(_target, _user, data, nextNonce[_user]++, _deadline, _v, _r, _s), ERROR_INVALID_SIGNATURE);

        assembly {
            let ptr := mload(0x40)
            let result := call(gas, _target, 0, add(data, 0x20), mload(data), 0, 0)
            returndatacopy(ptr, 0, returndatasize)
            switch result case 0 { revert(ptr, returndatasize) }
            default { return(ptr, returndatasize) }
        }
    }

    /**
    * @dev Get next nonce for an address
    */
    function getNextNonce(address _user) external view returns (uint256) {
        return nextNonce[_user];
    }

    /**
    * @dev Get EIP712 domain separator
    */
    function getDomainSeparator() external view returns (bytes32) {
        return _getDomainSeparator();
    }

    /**
    * @dev Tell whether a signature is valid
    */
    function _isSignatureValid(address _target, address _user, bytes memory _data, uint256 _nonce, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s)
        internal
        view
        returns (bool)
    {
        bytes32 encodeData = keccak256(abi.encode(address(this), _target, _data, msg.sender, _nonce, _deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), encodeData));
        address recoveredAddress = ecrecover(digest, _v, _r, _s);

        // Explicitly disallow authorizations for address(0) as ecrecover returns address(0) on malformed messages
        return _deadline >= getTimestamp() && recoveredAddress != address(0) && recoveredAddress == _user;
    }

    /**
    * @dev Get EIP712 domain separator
    */
    function _getDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(EIP712DOMAIN_HASH, NAME_HASH, VERSION_HASH, _chainId(), address(this)));
    }

    /**
    * @dev Chain ID
    */
    function _chainId() internal pure returns (uint256 chainId) {
        assembly { chainId := chainid() }
    }
}
