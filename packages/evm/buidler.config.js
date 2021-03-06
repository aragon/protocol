const { usePlugin } = require('@nomiclabs/buidler/config')

usePlugin('@nomiclabs/buidler-ganache')
usePlugin('@nomiclabs/buidler-truffle5')
usePlugin('buidler-gas-reporter')
usePlugin('buidler-local-networks-config-plugin')
usePlugin('solidity-coverage')

module.exports = {
  networks: {
    // Local development network using ganache. You can set any of the
    // Ganache's options. All of them are supported, with the exception
    // of accounts.
    // https://github.com/trufflesuite/ganache-core#options
    ganache: {
      url: 'http://localhost:8545',
      gasLimit: 6000000000,
      defaultBalanceEther: 100
    },
    // Local development network to test coverage. Solidity coverage
    // pluging launches its own in-process ganache server.
    // and expose it at port 8555.
    coverage: {
      url: 'http://localhost:8555'
    },
    // Mainnet network configured with Aragon node.
    mainnet: {
      url: 'https://mainnet.eth.aragon.network'
    },
    // Rinkeby network configured with Aragon node.
    rinkeby: {
      url: 'https://rinkeby.eth.aragon.network'
    },
    // Network configured to interact with Frame wallet. Requires
    // to have Frame running on your machine. Download it from:
    // https://frame.sh
    frame: {
      httpHeaders: { origin: 'buidler' },
      url: 'http://localhost:1248'
    }
  },
  solc: {
    version: '0.5.17',
    optimizer: {
      enabled: true,
      runs: 400
    }
  },
  // The gas reporter plugin do not properly handle the buidlerevm
  // chain yet. In the mean time we should 'npx buidler node' and
  // then attach to running process using '--network localhost' as
  // explained in: https://buidler.dev/buidler-evm/#connecting-to-buidler-evm-from-wallets-and-other-software.
  // You can also run 'yarn devchain' and on a separate terminal run 'yarn test:gas'
  gasReporter: {
    enabled: !!process.env.REPORT_GAS
  }
}
