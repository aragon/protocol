const governor = require('../../../src/shared/Governor')

const ropsten = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA Giorgi Lagidze's Address

const staging = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA Giorgi Lagidze's Address

const rinkeby = governor('0x94C34FB5025e054B24398220CBDaBE901bd8eE5e')    // EOA Giorgi Lagidze's Address

const mainnet = governor('0xa974A0436b5D2842f47312832618900b1B633617')    // Sam Furter's Address

module.exports = {
  ropsten,
  staging,
  rinkeby,
  mainnet
}
