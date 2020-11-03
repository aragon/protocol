pragma solidity ^0.5.17;


contract RelayerMock {
    function relay(address _target, bytes calldata _data) external {
        bytes memory data = _data;
        assembly {
            let ptr := mload(0x40)
            let result := call(gas, _target, 0, add(data, 0x20), mload(data), 0, 0)
            returndatacopy(ptr, 0, returndatasize)
            switch result case 0 { revert(ptr, returndatasize) }
            default { return(ptr, returndatasize) }
        }
    }
}
