const { task, usePlugin } = require('@nomiclabs/buidler/config')

const Environment = require('./src/shared/Environment')
const { deployCourt, deployFaucet } = require('./scripts')

usePlugin('@nomiclabs/buidler-truffle5')
usePlugin("@nomiclabs/buidler-web3")
usePlugin('buidler-local-networks-config-plugin')

const executeTask = async (bre, fn, args = {}) => {
  const network = bre.network.name
  const config = bre.config.networks[network]
  const environment = new Environment(config, bre.web3)
  return fn(network, environment, args)
}

task('deploy-court', 'Deploy Aragon Court')
  .setAction((args, bre) => executeTask(bre, deployCourt, args))

task('deploy-faucet', 'Deploy token faucet')
  .setAction((args, bre) => executeTask(bre, deployFaucet, args))



module.exports = {
  networks: {
    ganache: {
      url: 'http://localhost:8545',
      gasLimit: 8000000,
      defaultBalanceEther: 1000
    }
  }
}
