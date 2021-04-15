const ganache = require('./court.ganache')
const ropsten = require('./court.ropsten')
const rinkeby = require('./court.rinkeby')
const staging = require('./court.staging')
const mainnet = require('./court.mainnet')

module.exports = {
  ganache,
  ropsten,
  rinkeby,
  staging,
  mainnet
}
