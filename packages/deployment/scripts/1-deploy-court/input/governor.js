const governor = require('../../../src/shared/Governor')

const ropsten = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA

const staging = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA

const rinkeby = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA

const mainnet = undefined // TODO

module.exports = {
  ropsten,
  staging,
  rinkeby,
  mainnet
}
