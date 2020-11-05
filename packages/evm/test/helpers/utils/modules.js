const { soliditySha3, keccak256 } = require('web3-utils')

const MODULE_IDS = {
  disputes: keccak256('DISPUTE_MANAGER'),
  registry: keccak256('GUARDIANS_REGISTRY'),
  voting: keccak256('VOTING'),
  payments: keccak256('PAYMENTS_BOOK'),
  treasury: keccak256('TREASURY')
}

const roleId = (module, fn) => {
  const { signature } = module.abi.find(x => x.type === 'function' && x.name === fn)
  return soliditySha3(module.address, signature)
}

module.exports = {
  roleId,
  MODULE_IDS
}
