const path = require('path')
const config = require('./input/protocol')
const ProtocolDeployer = require('../../src/deployers/ProtocolDeployer')

const OUTPUT_DIR = './output/protocol'

module.exports = async (network, environment) => {
  const output = path.resolve(__dirname, `${OUTPUT_DIR}.${network}.json`)
  const deployer = new ProtocolDeployer(config[network], environment, output)
  return deployer.call()
}
