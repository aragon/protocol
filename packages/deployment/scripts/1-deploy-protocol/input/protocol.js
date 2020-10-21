const localhost = require('./protocol.localhost')
const ropsten = require('./protocol.ropsten')
const rinkeby = require('./protocol.rinkeby')
const staging = require('./protocol.staging')
const mainnet = require('./protocol.mainnet')

module.exports = {
  localhost,
  ropsten,
  rinkeby,
  staging,
  mainnet
}
