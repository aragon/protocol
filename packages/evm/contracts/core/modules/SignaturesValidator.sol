pragma solidity ^0.5.17;

import "../../lib/utils/TimeHelpers.sol";


contract SignaturesValidator is TimeHelpers {
    string private constant ERROR_INVALID_SIGNATURE = "SV_INVALID_SIGNATURE";

    // deadline + [r,s,v] signature
    uint256 internal constant EXTRA_CALLDATA_LENGTH = 32 * 3 + 1;
    // bytes32 private constant EIP712DOMAIN_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 internal constant EIP712DOMAIN_HASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    // bytes32 private constant NAME_HASH = keccak256("Aragon Protocol")
    bytes32 internal constant NAME_HASH = 0xa0d9e49a5b2f7cb3ade18ca4d0e001fa655c6d026766aba753a8b0f12201bc51;
    // bytes32 private constant VERSION_HASH = keccak256("1")
    bytes32 internal constant VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    modifier authenticate(address _user) {
        _validateSignature(_user);
        _;
    }

    mapping (address => uint256) internal nextNonce;

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
    * @dev Validate signature
    */
    function _validateSignature(address _user) internal {
        require(_isSignatureValid(_user), ERROR_INVALID_SIGNATURE);
    }

    /**
    * @dev Tell whether a signature is valid and update nonce
    */
    function _isSignatureValid(address _user) internal returns (bool) {
        return msg.sender == _user || _isSignatureValid(_user, nextNonce[_user]++);
    }

    /**
    * @dev Tell whether a signature is valid
    */
    function _isSignatureValid(address _user, uint256 _nonce) internal view returns (bool) {
        if (msg.sender == _user) {
            return true;
        }

        (bytes memory data, uint256 deadline, bytes32 r, bytes32 s, uint8 v) = _decodeCalldata();
        bytes32 encodeData = keccak256(abi.encode(data, msg.sender, _nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeparator(), encodeData));
        address recoveredAddress = ecrecover(digest, v, r, s);

        // Explicitly disallow authorizations for address(0) as ecrecover returns address(0) on malformed messages
        return deadline >= getTimestamp() && recoveredAddress != address(0) && recoveredAddress == _user;
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

    /**
    * @dev Decode extra calldata
    */
    function _decodeCalldata() internal pure returns (bytes memory data, uint256 deadline, bytes32 r, bytes32 s, uint8 v) {
        data = msg.data;
        if (data.length > EXTRA_CALLDATA_LENGTH) {
            assembly {
                let realCalldataSize := sub(calldatasize, EXTRA_CALLDATA_LENGTH)
                let extraCalldataPtr := add(add(data, 0x20), realCalldataSize)
                deadline := mload(extraCalldataPtr)
                r := mload(add(extraCalldataPtr, 0x20))
                s := mload(add(extraCalldataPtr, 0x40))
                v := byte(0, mload(add(extraCalldataPtr, 0x60)))
                mstore(data, realCalldataSize)
            }
        }
    }
}
