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
    },
    staging: {
      url: "https://rinkeby.infura.io/v3/7a03fcb37be7479da06f92c5117afd47",
      accounts: ['0x188f20fbb60eaf10ca87088ace8d4c20bb5687848ee462044db4a9ad442dcc81']
    },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/7a03fcb37be7479da06f92c5117afd47',
      accounts: ['0x082be7c0b8f7bb0efb0e08dfa08f2fc03704bc8cba3caff5e611f8b06ac13c25'],
      timeout: 200000000
    }
  }
}
