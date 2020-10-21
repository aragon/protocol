const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { sha3, soliditySha3, padLeft, toHex, toChecksumAddress } = require('web3-utils')

const MODULE_IDS = {
  disputes: sha3('DISPUTE_MANAGER'),
  treasury: sha3('TREASURY'),
  voting: sha3('VOTING'),
  registry: sha3('GUARDIANS_REGISTRY'),
  payments: sha3('PAYMENTS_BOOK')
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
