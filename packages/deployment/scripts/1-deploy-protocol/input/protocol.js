const ganache = require('./protocol.ganache')
const ropsten = require('./protocol.ropsten')
const rinkeby = require('./protocol.rinkeby')
const staging = require('./protocol.staging')
const mainnet = require('./protocol.mainnet')

module.exports = {
  ganache,
  ropsten,
  rinkeby,
  staging,
  mainnet
}
