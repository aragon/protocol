const { sha3 } = require('web3-utils')

const MODULE_IDS = {
  disputes: sha3('DISPUTE_MANAGER'),
  registry: sha3('GUARDIANS_REGISTRY'),
  voting: sha3('VOTING'),
  payments: sha3('PAYMENTS_BOOK'),
  treasury: sha3('TREASURY')
}

module.exports = {
  MODULE_IDS
}
