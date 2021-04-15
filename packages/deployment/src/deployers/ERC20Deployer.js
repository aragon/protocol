const BaseDeployer = require('./BaseDeployer')
const logger = require('../helpers/logger')('ERC20Deployer')

module.exports = class extends BaseDeployer {
  constructor(config, environment, output) {
    super(environment, output)
    this.config = config
  }

  async call() {
    const token = this.previousDeploy[this.config.symbol]
    const ERC20 = await this.environment.getArtifact('ERC20Mock', '@aragon/court-evm')

    return (token && token.address)
      ? this._loadToken(ERC20, token.address)
      : this._deployToken(ERC20)
  }

  async _loadToken(ERC20, address) {
    logger.warn(`Using previous deployed ${this.config.symbol} instance at ${address}`)
    return ERC20.at(address)
  }

  async _deployToken(ERC20) {
    this._printTokenDeploy()
    const { symbol, name, decimals } = this.config
    const token = await ERC20.new(name, symbol, decimals)
    const { address, transactionHash } = token
    logger.success(`Created ${symbol} token instance at ${address}`)
    this._saveDeploy({ [symbol]: { address, transactionHash }})
    return token
  }

  _printTokenDeploy() {
    logger.info('Deploying ERC20 contract with config:')
    logger.info(` - Name:       ${this.config.name || this.config.symbol}`)
    logger.info(` - Symbol:     ${this.config.symbol}`)
    logger.info(` - Decimals:   ${this.config.decimals.toString()}`)
  }
}
