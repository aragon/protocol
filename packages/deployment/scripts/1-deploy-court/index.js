const path = require('path')
const config = require('./input/court')
const CourtDeployer = require('../../src/deployers/CourtDeployer')

const OUTPUT_DIR = './output/court'

module.exports = async (network, environment) => {
  const output = path.resolve(__dirname, `${OUTPUT_DIR}.${network}.json`)
  const deployer = new CourtDeployer(config[network], environment, output)
  return deployer.call()
}
