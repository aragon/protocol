const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
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
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await protocol.setModule(moduleId, currentGuardiansRegistry.address, { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the treasury module does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.setModules([moduleId], [currentGuardiansRegistry.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentGuardiansRegistry.linkedModules(MODULE_IDS.disputes), protocolHelper.disputeManager.address, 'dispute manager linked of the registry does not match')
      assert.equal(await currentGuardiansRegistry.linkedModules(moduleId), ZERO_ADDRESS, 'registry linked of the registry does not match')

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), currentGuardiansRegistry.address, 'registry linked of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), currentGuardiansRegistry.address, 'registry linked for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the payments book module does not match')
    })
  })

  context('when migrating the payments module', () => {
    let previousPaymentsBook, currentPaymentsBook, moduleId = MODULE_IDS.payments

    beforeEach('load dispute managers', async () => {
      previousPaymentsBook = protocolHelper.paymentsBook
      currentPaymentsBook = await PaymentsBook.new(protocol.address, protocolHelper.paymentPeriodDuration, protocolHelper.paymentsGovernorSharePct)
    })

    it('does not affect linked modules if it is not requested', async () => {
      await protocol.setModule(moduleId, currentPaymentsBook.address, { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the treasury module does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.setModules([moduleId], [currentPaymentsBook.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentPaymentsBook.linkedModules(MODULE_IDS.disputes), protocolHelper.disputeManager.address, 'dispute manager linked of the payments book does not match')
      assert.equal(await currentPaymentsBook.linkedModules(moduleId), ZERO_ADDRESS, 'payments book linked of the payments book does not match')

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), currentPaymentsBook.address, 'payments book linked of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), currentPaymentsBook.address, 'payments book linked for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the payments book module does not match')
    })
  })

  context('when migrating the voting module', () => {
    let previousVoting, currentVoting, moduleId = MODULE_IDS.voting

    beforeEach('load dispute managers', async () => {
      previousVoting = protocolHelper.voting
      currentVoting = await Voting.new(protocol.address)
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await protocol.setModule(moduleId, currentVoting.address, { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), previousVoting.address, 'voting linked of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousVoting.address, 'voting linked for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), previousVoting.address, 'voting linked for the treasury module does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousVoting.address, 'voting linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousVoting.address, 'voting linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.setModules([moduleId], [currentVoting.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentVoting.linkedModules(MODULE_IDS.disputes), protocolHelper.disputeManager.address, 'voting linked of the payments book does not match')
      assert.equal(await currentVoting.linkedModules(moduleId), ZERO_ADDRESS, 'voting linked of the voting does not match')

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), currentVoting.address, 'voting linked of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), currentVoting.address, 'voting linked for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousVoting.address, 'voting linked for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousVoting.address, 'voting linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousVoting.address, 'voting linked for the payments book module does not match')
    })
  })

  context('when migrating the treasury module', () => {
    let previousTreasury, currentTreasury, moduleId = MODULE_IDS.treasury

    beforeEach('load dispute managers', async () => {
      previousTreasury = protocolHelper.treasury
      currentTreasury = await Treasury.new(protocol.address)
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await protocol.setModule(moduleId, currentTreasury.address, { from: modulesGovernor })

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), previousTreasury.address, 'treasury linked of the dispute manager does not match')
      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the guardians registry does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the treasury module does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [protocolHelper.disputeManager.address, protocolHelper.treasury.address]
      await protocol.setModules([moduleId], [currentTreasury.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentTreasury.linkedModules(MODULE_IDS.disputes), protocolHelper.disputeManager.address, 'dispute manager linked of the treasury does not match')
      assert.equal(await currentTreasury.linkedModules(moduleId), ZERO_ADDRESS, 'treasury linked of the treasury does not match')

      assert.equal(await protocolHelper.disputeManager.linkedModules(moduleId), currentTreasury.address, 'treasury linked of the dispute manager does not match')
      assert.equal(await protocolHelper.treasury.linkedModules(moduleId), currentTreasury.address, 'treasury linked for the treasury module does not match')

      assert.equal(await protocolHelper.guardiansRegistry.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the guardians registry does not match')
      assert.equal(await protocolHelper.voting.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the voting module does not match')
      assert.equal(await protocolHelper.paymentsBook.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the payments book module does not match')
    })
  })
})
