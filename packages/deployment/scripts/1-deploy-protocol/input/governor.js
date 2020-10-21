const governor = require('../../../src/shared/Governor')

const ropsten = governor('0x0090aED150056316E37FE6DFa10Dc63E79D173B6')    // EOA

const staging = governor('0x0090aED150056316E37FE6DFa10Dc63E79D173B6')    // EOA

const rinkeby = governor('0x0090aED150056316E37FE6DFa10Dc63E79D173B6')    // EOA

const mainnet = undefined // TODO

module.exports = {
  ropsten,
  staging,
  rinkeby,
  mainnet
}
