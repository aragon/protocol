const { keccak256 } = require('web3-utils')

const MODULE_IDS = {
  disputes: keccak256('DISPUTE_MANAGER'),
  registry: keccak256('GUARDIANS_REGISTRY'),
  voting: keccak256('VOTING'),
  payments: keccak256('PAYMENTS_BOOK'),
  treasury: keccak256('TREASURY')
}

module.exports = {
  MODULE_IDS
}
