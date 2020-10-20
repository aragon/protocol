const { fromWei } = require('web3-utils')
const { MAX_UINT64 } = require('@aragon/contract-helpers-test')

const BaseDeployer = require('./BaseDeployer')
const ERC20Deployer = require('./ERC20Deployer')
const Governor = require('../shared/Governor')
const logger = require('../helpers/logger')('ProtocolDeployer')

const MODULES = {
  DISPUTE_MANAGER:    '0x14a6c70f0f6d449c014c7bbc9e68e31e79e8474fb03b7194df83109a2d888ae6',
  TREASURY:           '0x06aa03964db1f7257357ef09714a5f0ca3633723df419e97015e0c7a3e83edb7',
  VOTING:             '0x7cbb12e82a6d63ff16fe43977f43e3e2b247ecd4e62c0e340da8800a48c67346',
  GUARDIANS_REGISTRY: '0x8af7b7118de65da3b974a3fd4b0c702b66442f74b9dff6eaed1037254c0b79fe',
  PAYMENTS_BOOK:      '0xfa275b1417437a2a2ea8e91e9fe73c28eaf0a28532a250541da5ac0d1892b418'
}

module.exports = class extends BaseDeployer {
  constructor(config, environment, output) {
    super(environment, output)
    this.config = config
  }

  async call() {
    await this.loadGovernorIfNecessary()
    await this.deployTokensIfNecessary()
    await this.loadOrDeployProtocol()
    await this.loadOrDeployDisputes()
    await this.loadOrDeployRegistry()
    await this.loadOrDeployVoting()
    await this.loadOrDeployTreasury()
    await this.loadOrDeployPaymentsBook()
    await this.setModules()
    await this.transferGovernor()
    return this.protocol
  }

  async loadGovernorIfNecessary() {
    if (!this.config.governor) {
      logger.warn('No governor specified, using default sender instead')
      const sender = await this.environment.getSender()
      this.config.governor = Governor(sender)
    }
  }

  async loadOrDeployProtocol() {
    const { protocol } = this.previousDeploy
    const AragonProtocol = await this.environment.getArtifact('AragonProtocol', '@aragon/protocol-evm')

    if (protocol && protocol.address) await this._loadAragonProtocol(AragonProtocol, protocol.address)
    else await this._deployAragonProtocol(AragonProtocol)
  }

  async loadOrDeployDisputes() {
    const { disputes } = this.previousDeploy
    const DisputeManager = await this.environment.getArtifact('DisputeManager', '@aragon/protocol-evm')

    if (disputes && disputes.address) await this._loadDisputes(DisputeManager, disputes.address)
    else await this._deployDisputes(DisputeManager)
  }

  async loadOrDeployRegistry() {
    const { registry } = this.previousDeploy
    const GuardiansRegistry = await this.environment.getArtifact('GuardiansRegistry', '@aragon/protocol-evm')

    if (registry && registry.address) await this._loadRegistry(GuardiansRegistry, registry.address)
    else await this._deployRegistry(GuardiansRegistry)
  }

  async loadOrDeployVoting() {
    const { voting } = this.previousDeploy
    const Voting = await this.environment.getArtifact('CRVoting', '@aragon/protocol-evm')

    if (voting && voting.address) await this._loadVoting(Voting, voting.address)
    else await this._deployVoting(Voting)
  }

  async loadOrDeployTreasury() {
    const { treasury } = this.previousDeploy
    const Treasury = await this.environment.getArtifact('ProtocolTreasury', '@aragon/protocol-evm')

    if (treasury && treasury.address) await this._loadTreasury(Treasury, treasury.address)
    else await this._deployTreasury(Treasury)
  }

  async loadOrDeployPaymentsBook() {
    const { paymentsBook } = this.previousDeploy
    const PaymentsBook = await this.environment.getArtifact('PaymentsBook', '@aragon/protocol-evm')

    if (paymentsBook && paymentsBook.address) await this._loadPaymentsBook(PaymentsBook, paymentsBook.address)
    else await this._deployPaymentsBook(PaymentsBook)
  }

  async setModules() {
    const sender = await this.environment.getSender()
    const modulesGovernor = await this.protocol.getModulesGovernor()

    if (modulesGovernor === sender) {
      logger.info('Setting modules...')
      const ids = [MODULES.DISPUTE_MANAGER, MODULES.TREASURY, MODULES.VOTING, MODULES.GUARDIANS_REGISTRY, MODULES.PAYMENTS_BOOK]
      const implementations = [this.disputes, this.treasury, this.voting, this.registry, this.paymentsBook].map(i => i.address)
      await this.protocol.setModules(ids, implementations)
      logger.info('Caching modules...')
      await this.protocol.cacheModules(implementations, ids)
      logger.success('Modules set successfully')
    } else {
      logger.warn('Cannot set modules since sender is no longer the modules governor')
    }
  }

  async transferGovernor() {
    const sender = await this.environment.getSender()
    const currentGovernor = await this.protocol.getModulesGovernor()
    const { governor } = this.config

    if (currentGovernor === sender) {
      logger.info(`Transferring modules governor to ${governor} ...`)
      await this.protocol.changeModulesGovernor(governor.address)
      logger.success(`Modules governor transferred successfully to ${governor}`)
    } else if (currentGovernor === governor.address) {
      logger.success(`Modules governor is already set to ${governor}`)
    } else {
      logger.warn('Modules governor is already set to another address')
    }
  }

  async deployTokensIfNecessary() {
    if (!this.config.token || !this.config.token.address) {
      const tokenConfig = { name: 'ANT', symbol: 'ANT', decimals: 18 }
      const token = await new ERC20Deployer(tokenConfig, this.environment, this.output).call()
      tokenConfig.address = token.address
      this.config.token = tokenConfig
    }

    if (!this.config.feeToken || !this.config.feeToken.address) {
      const feeTokenConfig = { name: 'DAI', symbol: 'DAI', decimals: 18 }
      const feeToken = await new ERC20Deployer(feeTokenConfig, this.environment, this.output).call()
      feeTokenConfig.address = feeToken.address
      this.config.feeToken = feeTokenConfig
    }
  }

  /** loading methods **/

  async _loadAragonProtocol(AragonProtocol, address) {
    logger.warn(`Using previous deployed AragonProtocol instance at ${address}`)
    this.protocol = await AragonProtocol.at(address)
  }

  async _loadDisputes(DisputeManager, address) {
    logger.warn(`Using previous deployed DisputeManager instance at ${address}`)
    this.disputes = await DisputeManager.at(address)
  }

  async _loadRegistry(GuardiansRegistry, address) {
    logger.warn(`Using previous deployed GuardiansRegistry instance at ${address}`)
    this.registry = await GuardiansRegistry.at(address)
  }

  async _loadVoting(Voting, address) {
    logger.warn(`Using previous deployed Voting instance at ${address}`)
    this.voting = await Voting.at(address)
  }

  async _loadTreasury(Treasury, address) {
    logger.warn(`Using previous deployed Treasury instance at ${address}`)
    this.treasury = await Treasury.at(address)
  }

  async _loadPaymentsBook(PaymentsBook, address) {
    logger.warn(`Using previous deployed PaymentsBook instance at ${address}`)
    this.paymentsBook = await PaymentsBook.at(address)
  }

  /** deploying methods **/

  async _deployAragonProtocol(AragonProtocol) {
    this._printAragonProtocolDeploy()
    const sender = await this.environment.getSender()

    this.protocol = await AragonProtocol.new(
      [this.config.termDuration, this.config.firstTermStartTime],
      [this.config.governor.address, this.config.governor.address, sender],
      this.config.feeToken.address,
      [this.config.guardianFee, this.config.draftFee, this.config.settleFee],
      [this.config.evidenceTerms, this.config.commitTerms, this.config.revealTerms, this.config.appealTerms, this.config.appealConfirmTerms],
      [this.config.penaltyPct, this.config.finalRoundReduction],
      [this.config.firstRoundGuardiansNumber, this.config.appealStepFactor, this.config.maxRegularAppealRounds, this.config.finalRoundLockTerms],
      [this.config.appealCollateralFactor, this.config.appealConfirmCollateralFactor],
      this.config.minActiveBalance
    )

    const { address, transactionHash } = this.protocol
    logger.success(`Created AragonProtocol instance at ${address}`)
    this._saveDeploy({ protocol: { address, transactionHash }})
  }

  async _deployDisputes(DisputeManager) {
    this._printDisputesDeploy()
    this.disputes = await DisputeManager.new(this.protocol.address, this.config.maxGuardiansPerDraftBatch, this.config.skippedDisputes)
    const { address, transactionHash } = this.disputes
    logger.success(`Created DisputeManager instance at ${address}`)
    this._saveDeploy({ disputes: { address, transactionHash }})
  }

  async _deployRegistry(GuardiansRegistry) {
    this._printRegistryDeploy()
    const totalActiveBalanceLimit = this.config.minActiveBalance.mul(MAX_UINT64.div(this.config.finalRoundWeightPrecision))
    this.registry = await GuardiansRegistry.new(this.protocol.address, this.config.token.address, totalActiveBalanceLimit)
    const { address, transactionHash } = this.registry
    logger.success(`Created GuardiansRegistry instance at ${address}`)
    this._saveDeploy({ registry: { address, transactionHash }})
  }

  async _deployVoting(Voting) {
    this._printVotingDeploy()
    this.voting = await Voting.new(this.protocol.address)
    const { address, transactionHash } = this.voting
    logger.success(`Created Voting instance at ${address}`)
    this._saveDeploy({ voting: { address, transactionHash }})
  }

  async _deployTreasury(Treasury) {
    this._printTreasuryDeploy()
    this.treasury = await Treasury.new(this.protocol.address)
    const { address, transactionHash } = this.treasury
    logger.success(`Created Treasury instance at ${address}`)
    this._saveDeploy({ treasury: { address, transactionHash }})
  }

  async _deployPaymentsBook(PaymentsBook) {
    this._printPaymentsBookDeploy()
    this.paymentsBook = await PaymentsBook.new(this.protocol.address, this.config.paymentPeriodDuration, this.config.paymentsGovernorSharePct)
    const { address, transactionHash } = this.paymentsBook
    logger.success(`Created PaymentsBook instance at ${address}`)
    this._saveDeploy({ paymentsBook: { address, transactionHash }})
  }

  /** logging methods **/

  _printAragonProtocolDeploy() {
    logger.info(`Deploying Aragon Protocol contract with config:`)
    logger.info(` - Funds governor:                                 ${this.config.governor.describe()}`)
    logger.info(` - Config governor:                                ${this.config.governor.describe()}`)
    logger.info(` - Modules governor:                               ${this.config.governor.describe()} (initially sender)`)
    logger.info(` - Guardians token:                                ${this.config.token.symbol} at ${this.config.token.address}`)
    logger.info(` - Minimum active balance:                         ${fromWei(this.config.minActiveBalance)} ${this.config.token.symbol}`)
    logger.info(` - Term duration:                                  ${this.config.termDuration.toString()} seconds`)
    logger.info(` - First term start time:                          ${new Date(this.config.firstTermStartTime.toNumber() * 1000)}`)
    logger.info(` - Fee token:                                      ${this.config.feeToken.symbol} at ${this.config.feeToken.address}`)
    logger.info(` - Guardian fee:                                   ${fromWei(this.config.guardianFee)} ${this.config.feeToken.symbol}`)
    logger.info(` - Draft fee:                                      ${fromWei(this.config.draftFee)} ${this.config.feeToken.symbol}`)
    logger.info(` - Settle fee:                                     ${fromWei(this.config.settleFee)} ${this.config.feeToken.symbol}`)
    logger.info(` - Evidence terms:                                 ${this.config.evidenceTerms.toString()}`)
    logger.info(` - Commit terms:                                   ${this.config.commitTerms.toString()}`)
    logger.info(` - Reveal terms:                                   ${this.config.revealTerms.toString()}`)
    logger.info(` - Appeal terms:                                   ${this.config.appealTerms.toString()}`)
    logger.info(` - Appeal confirmation terms:                      ${this.config.appealConfirmTerms.toString()}`)
    logger.info(` - Guardian penalty permyriad:                     ${this.config.penaltyPct.toString()} ‱`)
    logger.info(` - First round guardians number:                   ${this.config.firstRoundGuardiansNumber.toString()}`)
    logger.info(` - Appeal step factor:                             ${this.config.appealStepFactor.toString()}`)
    logger.info(` - Max regular appeal rounds:                      ${this.config.maxRegularAppealRounds.toString()}`)
    logger.info(` - Final round reduction:                          ${this.config.finalRoundReduction.toString()} ‱`)
    logger.info(` - Final round lock terms:                         ${this.config.finalRoundLockTerms.toString()}`)
    logger.info(` - Appeal collateral factor:                       ${this.config.appealCollateralFactor.toString()} ‱`)
    logger.info(` - Appeal confirmation collateral factor:          ${this.config.appealConfirmCollateralFactor.toString()} ‱`)
  }

  _printDisputesDeploy() {
    logger.info(`Deploying DisputeManager contract with config:`)
    logger.info(` - Controller:                                     ${this.protocol.address}`)
    logger.info(` - Max number of guardians per draft batch:        ${this.config.maxGuardiansPerDraftBatch}`)
    logger.info(` - # of skipped disputes:                          ${this.config.skippedDisputes}`)
  }

  _printRegistryDeploy() {
    logger.info(`Deploying GuardiansRegistry contract with config:`)
    logger.info(` - Controller:                                     ${this.protocol.address}`)
    logger.info(` - Guardians token:                                ${this.config.token.symbol} at ${this.config.token.address}`)
    logger.info(` - Minimum active balance:                         ${fromWei(this.config.minActiveBalance)} ${this.config.token.symbol}`)
  }

  _printVotingDeploy() {
    logger.info('Deploying Voting contract with config:')
    logger.info(` - Controller:                                     ${this.protocol.address}`)
  }

  _printTreasuryDeploy() {
    logger.info(`Deploying Treasury contract with config:`)
    logger.info(` - Controller:                                     ${this.protocol.address}`)
  }

  _printPaymentsBookDeploy() {
    logger.info(`Deploying PaymentsBook contract with config:`)
    logger.info(` - Controller:                                     ${this.protocol.address}`)
    logger.info(` - Period duration:                                ${this.config.paymentPeriodDuration} terms`)
    logger.info(` - Governor share:                                 ${this.config.paymentsGovernorSharePct.toString()} ‱`)
  }
}
