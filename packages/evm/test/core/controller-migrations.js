const { assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { MODULE_IDS } = require('../helpers/utils/modules')
const { CONTROLLED_ERRORS, DISPUTE_MANAGER_ERRORS } = require('../helpers/utils/errors')

const DisputeManager = artifacts.require('DisputeManager')
const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const Treasury = artifacts.require('ProtocolTreasury')
const Voting = artifacts.require('CRVoting')
const PaymentsBook = artifacts.require('PaymentsBook')

contract('Controller', ([_, modulesGovernor]) => {
  let protocolHelper, protocol

  beforeEach('create protocol', async () => {
    protocolHelper = buildHelper()
    protocol = await protocolHelper.deploy({ modulesGovernor })
  })

  context('when migrating the dispute manager', () => {
    let previousDisputeManager, currentDisputeManager

    beforeEach('load dispute managers', async () => {
      previousDisputeManager = protocolHelper.disputeManager
      currentDisputeManager = await DisputeManager.new(protocol.address, 50, 1)
    })

    it('disputes are created in the current one only', async () => {
      await protocol.setDisputeManager(currentDisputeManager.address)

      protocolHelper.disputeManager = currentDisputeManager
      const disputeId = await protocolHelper.dispute()

      assert.equal((await currentDisputeManager.getDispute(disputeId)).possibleRulings, 2, 'dispute does not exist')
      await assertRevert(previousDisputeManager.getDispute(disputeId), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
    })

    it('old disputes can continue its process', async () => {
      const oldDispute = await protocolHelper.dispute()

      await protocol.setDisputeManager(currentDisputeManager.address)
      protocolHelper.disputeManager = currentDisputeManager
      const newDispute = await protocolHelper.dispute()

      assert.equal((await previousDisputeManager.getDispute(oldDispute)).possibleRulings, 2, 'dispute does not exist')
      assert.equal((await currentDisputeManager.getDispute(newDispute)).possibleRulings, 2, 'dispute does not exist')
    })

    it('cannot create disputes if disabled', async () => {
      await protocol.disableModule(previousDisputeManager.address, { from: modulesGovernor })

      await assertRevert(protocolHelper.dispute(), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
    })
  })

  context('when migrating the guardians registry', () => {
    let previousGuardiansRegistry, currentGuardiansRegistry, moduleId = MODULE_IDS.registry

    beforeEach('load dispute managers', async () => {
      previousGuardiansRegistry = protocolHelper.guardiansRegistry
      currentGuardiansRegistry = await GuardiansRegistry.new(protocol.address, protocolHelper.guardianToken.address, 1)
      await protocol.setModule(moduleId, currentGuardiansRegistry.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the treasury module does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), currentGuardiansRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), currentGuardiansRegistry.address, 'registry cached for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousGuardiansRegistry.address, 'registry cached for the payments book module does not match')
    })
  })

  context('when migrating the payments module', () => {
    let previousPaymentsBook, currentPaymentsBook, moduleId = MODULE_IDS.payments

    beforeEach('load dispute managers', async () => {
      previousPaymentsBook = protocolHelper.paymentsBook
      currentPaymentsBook = await PaymentsBook.new(protocol.address, protocolHelper.paymentPeriodDuration, protocolHelper.paymentsGovernorSharePct)
      await protocol.setModule(moduleId, currentPaymentsBook.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the treasury module does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), currentPaymentsBook.address, 'payments book cached of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), currentPaymentsBook.address, 'payments book cached for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousPaymentsBook.address, 'payments book cached for the payments book module does not match')
    })
  })

  context('when migrating the voting module', () => {
    let previousVoting, currentVoting, moduleId = MODULE_IDS.voting

    beforeEach('load dispute managers', async () => {
      previousVoting = protocolHelper.voting
      currentVoting = await Voting.new(protocol.address)
      await protocol.setModule(moduleId, currentVoting.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), previousVoting.address, 'voting cached of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousVoting.address, 'voting cached for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), previousVoting.address, 'voting cached for the treasury module does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousVoting.address, 'voting cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), currentVoting.address, 'voting cached of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), currentVoting.address, 'voting cached for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousVoting.address, 'voting cached for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousVoting.address, 'voting cached for the payments book module does not match')
    })
  })

  context('when migrating the treasury module', () => {
    let previousTreasury, currentTreasury, moduleId = MODULE_IDS.treasury

    beforeEach('load dispute managers', async () => {
      previousTreasury = protocolHelper.treasury
      currentTreasury = await Treasury.new(protocol.address)
      await protocol.setModule(moduleId, currentTreasury.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), previousTreasury.address, 'treasury cached of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the treasury module does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.modulesCache(moduleId), currentTreasury.address, 'treasury cached of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.modulesCache(moduleId), currentTreasury.address, 'treasury cached for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.modulesCache(moduleId), previousTreasury.address, 'treasury cached for the payments book module does not match')
    })
  })
})
