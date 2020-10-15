const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { soliditySha3, padLeft, toHex, toChecksumAddress } = require('web3-utils')

const MODULE_IDS = {
    disputes: '0x14a6c70f0f6d449c014c7bbc9e68e31e79e8474fb03b7194df83109a2d888ae6',
    treasury: '0x06aa03964db1f7257357ef09714a5f0ca3633723df419e97015e0c7a3e83edb7',
    voting: '0x7cbb12e82a6d63ff16fe43977f43e3e2b247ecd4e62c0e340da8800a48c67346',
    registry: '0x3b21d36b36308c830e6c4053fb40a3b6d79dde78947fbf6b0accd30720ab5370',
    subscriptions: '0x2bfa3327fe52344390da94c32a346eeb1b65a8b583e4335a419b9471e88c1365'
}

const getCachedAddress = async (target, moduleId) => {
    // The modules cache are stored at the 1st index of the controlled contract storage
    const modulesCacheSlot = padLeft(1, 64)
    // Parse module ID en hexadecimal and pad 64
    const moduleIdHex = padLeft(toHex(moduleId), 64)
    // The modules cache is a mapping indexed by modules ID
    const moduleSlot = soliditySha3(moduleIdHex + modulesCacheSlot.slice(2))
    // Read storage and parse address
    const address = await web3.eth.getStorageAt(target.address, moduleSlot)
    return address === '0x0' ? ZERO_ADDRESS : toChecksumAddress(address)
}

module.exports = {
    MODULE_IDS,
    getCachedAddress
}
