const path = require('path')
const config = require('./input/faucet')
const FaucetDeployer = require('../../src/deployers/FaucetDeployer')

const OUTPUT_DIR = './output/faucet'

module.exports = async (network, environment) => {
  const output = path.resolve(__dirname, `${OUTPUT_DIR}.${network}.json`)
  const deployer = new FaucetDeployer(config[network], environment, output)
  return deployer.call()
}
