const { fromWei } = require('web3-utils')

const BaseDeployer = require('./BaseDeployer')
const logger = require('../helpers/logger')('FaucetDeployer')

module.exports = class extends BaseDeployer {
  constructor(config, environment, output) {
    super(environment, output)
    this.config = config
  }

  async call() {
    const address = this.previousDeploy.address
    const ERC20Faucet = await this.environment.getArtifact('ERC20Faucet', '@aragonone/erc20-faucet')

    return address
        ? this._loadFaucet(ERC20Faucet, address)
        : this._deployFaucet(ERC20Faucet)
  }

  async _loadFaucet(ERC20Faucet, address) {
    logger.warn(`Using previous deployed faucet instance at ${address}`)
    return ERC20Faucet.at(address)
  }

  async _deployFaucet(ERC20Faucet) {
    const sender = await this.environment.getSender()
    this._printFaucetDeploy(sender)
    const { owner, tokens } = this.config

    const tokensAddresses = tokens.map(token => token.address)
    const quotaPeriods = tokens.map(token => token.period)
    const quotaAmounts = tokens.map(token => token.amount)
    const faucet = await ERC20Faucet.new(tokensAddresses, quotaPeriods, quotaAmounts)

    logger.info(`\nFunding faucet...`)
    const ERC20 = await this.environment.getArtifact('ERC20Mock', '@aragon/court-evm')
    for (const token of tokens) {
      logger.info(`Funding faucet with ${fromWei(token.donation)} ${token.symbol}...`)
      const erc20 = await ERC20.at(token.address)
      await erc20.generateTokens(sender, token.donation)
      await erc20.approve(faucet.address, token.donation)
      await faucet.donate(token.address, token.donation)
    }

    if (owner) {
      logger.info(`Transferring ownership to specified address ${owner} ...`)
      await faucet.transferOwnership(owner)
    }

    const { address, transactionHash } = faucet
    logger.success(`Created faucet instance at ${address}`)
    this._saveDeploy({ address, transactionHash })
    return faucet
  }

  _printFaucetDeploy() {
    logger.info('Deploying ERC20Faucet contract with tokens:')
    logger.info(` - Owner:                                     ${this.config.owner || 'sender address'}`)
    this.config.tokens.forEach(token => {
      logger.info(' - Token:')
      logger.info(`   - Symbol:                                  ${token.symbol}`)
      logger.info(`   - Address:                                 ${token.address}`)
      logger.info(`   - Quota period:                            ${token.period.toString()} seconds`)
      logger.info(`   - Quota amount:                            ${fromWei(token.amount)} ${token.symbol}`)
    })
  }
}
