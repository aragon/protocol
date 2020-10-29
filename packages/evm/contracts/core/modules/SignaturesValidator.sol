pragma solidity ^0.5.17;

import "../../lib/utils/TimeHelpers.sol";
import "../../lib/standards/IERC712.sol";


contract SignaturesValidator is IERC712, TimeHelpers {
    string private constant ERROR_INVALID_SIGNATURE = "SV_INVALID_SIGNATURE";

    // [v,r,s] signature + deadline
    uint256 internal constant EXTRA_CALLDATA_LENGTH = 32 * 4;
    // bytes32 private constant EIP712DOMAIN_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 internal constant EIP712DOMAIN_HASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    // bytes32 private constant NAME_HASH = keccak256("Aragon Protocol")
    bytes32 internal constant NAME_HASH = 0xd29d26249bb0c8fe08bcf70d00b6f5b6b54b653b5a7e4157b490095bbb233349;
    // bytes32 private constant VERSION_HASH = keccak256("1")
    bytes32 internal constant VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    modifier authenticate(address _user) {
        _validateSignature(_user);
        _;
    }

    mapping (address => uint256) internal nextNonce;

    constructor () public {
        // solium-disable-previous-line no-empty-blocks
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

        uint256 deadline = _deadline();
        (uint8 v, bytes32 r, bytes32 s) = _signature();
        bytes32 encodeData = keccak256(abi.encode(_calldata(), msg.sender, _nonce, deadline));
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
    * @dev Auth deadline encoded in calldata
    */
    function _deadline() internal pure returns (uint256) {
        return _decodeExtraCalldataWord(0);
    }

    /**
    * @dev Signature encoded in calldata
    */
    function _signature() internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        v = uint8(_decodeExtraCalldataWord(0x20));
        r = bytes32(_decodeExtraCalldataWord(0x40));
        s = bytes32(_decodeExtraCalldataWord(0x60));
    }

    /**
    * @dev Decode original calldata
    */
    function _calldata() internal pure returns (bytes memory result) {
        result = msg.data;
        if (result.length > EXTRA_CALLDATA_LENGTH) {
            assembly { mstore(result, sub(calldatasize, EXTRA_CALLDATA_LENGTH)) }
        }
    }

    /**
    * @dev Decode word from extra calldata
    */
    function _decodeExtraCalldataWord(uint256 _offset) internal pure returns (uint256 result) {
        uint256 offset = _offset;
        assembly {
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x20))
            calldatacopy(ptr, sub(calldatasize, sub(EXTRA_CALLDATA_LENGTH, offset)), 0x20)
            result := mload(ptr)
        }
    }
}
