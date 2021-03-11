const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { MODULE_IDS } = require('../helpers/utils/modules')
const { CONTROLLED_ERRORS, DISPUTE_MANAGER_ERRORS } = require('../helpers/utils/errors')

const DisputeManager = artifacts.require('DisputeManager')
const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const Treasury = artifacts.require('CourtTreasury')
const Voting = artifacts.require('CRVoting')
const PaymentsBook = artifacts.require('PaymentsBook')

contract('Controller', ([_, modulesGovernor]) => {
  let courtHelper, court

  beforeEach('create court', async () => {
    courtHelper = buildHelper()
    court = await courtHelper.deploy({ modulesGovernor })
  })

  context('when migrating the dispute manager', () => {
    let previousDisputeManager, currentDisputeManager

    beforeEach('load dispute managers', async () => {
      previousDisputeManager = courtHelper.disputeManager
      currentDisputeManager = await DisputeManager.new(court.address, 50, 1)
    })

    it('disputes are created in the current one only', async () => {
      await court.setDisputeManager(currentDisputeManager.address)

      courtHelper.disputeManager = currentDisputeManager
      const disputeId = await courtHelper.dispute()

      assert.equal((await currentDisputeManager.getDispute(disputeId)).possibleRulings, 2, 'dispute does not exist')
      await assertRevert(previousDisputeManager.getDispute(disputeId), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
    })

    it('old disputes can continue its process', async () => {
      const oldDispute = await courtHelper.dispute()

      await court.setDisputeManager(currentDisputeManager.address)
      courtHelper.disputeManager = currentDisputeManager
      const newDispute = await courtHelper.dispute()

      assert.equal((await previousDisputeManager.getDispute(oldDispute)).possibleRulings, 2, 'dispute does not exist')
      assert.equal((await currentDisputeManager.getDispute(newDispute)).possibleRulings, 2, 'dispute does not exist')
    })

    it('cannot create disputes if disabled', async () => {
      await court.disableModule(previousDisputeManager.address, { from: modulesGovernor })

      await assertRevert(courtHelper.dispute(), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
    })
  })

  context('when migrating the guardians registry', () => {
    let previousGuardiansRegistry, currentGuardiansRegistry, moduleId = MODULE_IDS.registry

    beforeEach('load dispute managers', async () => {
      previousGuardiansRegistry = courtHelper.guardiansRegistry
      currentGuardiansRegistry = await GuardiansRegistry.new(court.address, courtHelper.guardianToken.address, 1)
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await court.setModule(moduleId, currentGuardiansRegistry.address, { from: modulesGovernor })

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked of the dispute manager does not match')
      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the guardians registry does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the treasury module does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.setModules([moduleId], [currentGuardiansRegistry.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentGuardiansRegistry.linkedModules(MODULE_IDS.disputes), courtHelper.disputeManager.address, 'dispute manager linked of the registry does not match')
      assert.equal(await currentGuardiansRegistry.linkedModules(moduleId), ZERO_ADDRESS, 'registry linked of the registry does not match')

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), currentGuardiansRegistry.address, 'registry linked of the dispute manager does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), currentGuardiansRegistry.address, 'registry linked for the treasury module does not match')

      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the guardians registry does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousGuardiansRegistry.address, 'registry linked for the payments book module does not match')
    })
  })

  context('when migrating the payments module', () => {
    let previousPaymentsBook, currentPaymentsBook, moduleId = MODULE_IDS.payments

    beforeEach('load dispute managers', async () => {
      previousPaymentsBook = courtHelper.paymentsBook
      currentPaymentsBook = await PaymentsBook.new(court.address, courtHelper.paymentPeriodDuration, courtHelper.paymentsGovernorSharePct)
    })

    it('does not affect linked modules if it is not requested', async () => {
      await court.setModule(moduleId, currentPaymentsBook.address, { from: modulesGovernor })

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked of the dispute manager does not match')
      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the guardians registry does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the treasury module does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.setModules([moduleId], [currentPaymentsBook.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentPaymentsBook.linkedModules(MODULE_IDS.disputes), courtHelper.disputeManager.address, 'dispute manager linked of the payments book does not match')
      assert.equal(await currentPaymentsBook.linkedModules(moduleId), ZERO_ADDRESS, 'payments book linked of the payments book does not match')

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), currentPaymentsBook.address, 'payments book linked of the dispute manager does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), currentPaymentsBook.address, 'payments book linked for the treasury module does not match')

      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the guardians registry does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousPaymentsBook.address, 'payments book linked for the payments book module does not match')
    })
  })

  context('when migrating the voting module', () => {
    let previousVoting, currentVoting, moduleId = MODULE_IDS.voting

    beforeEach('load dispute managers', async () => {
      previousVoting = courtHelper.voting
      currentVoting = await Voting.new(court.address)
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await court.setModule(moduleId, currentVoting.address, { from: modulesGovernor })

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), previousVoting.address, 'voting linked of the dispute manager does not match')
      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousVoting.address, 'voting linked for the guardians registry does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), previousVoting.address, 'voting linked for the treasury module does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousVoting.address, 'voting linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousVoting.address, 'voting linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.setModules([moduleId], [currentVoting.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentVoting.linkedModules(MODULE_IDS.disputes), courtHelper.disputeManager.address, 'voting linked of the payments book does not match')
      assert.equal(await currentVoting.linkedModules(moduleId), ZERO_ADDRESS, 'voting linked of the voting does not match')

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), currentVoting.address, 'voting linked of the dispute manager does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), currentVoting.address, 'voting linked for the treasury module does not match')

      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousVoting.address, 'voting linked for the guardians registry does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousVoting.address, 'voting linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousVoting.address, 'voting linked for the payments book module does not match')
    })
  })

  context('when migrating the treasury module', () => {
    let previousTreasury, currentTreasury, moduleId = MODULE_IDS.treasury

    beforeEach('load dispute managers', async () => {
      previousTreasury = courtHelper.treasury
      currentTreasury = await Treasury.new(court.address)
    })

    it('does not affect the linked modules if it is not requested', async () => {
      await court.setModule(moduleId, currentTreasury.address, { from: modulesGovernor })

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), previousTreasury.address, 'treasury linked of the dispute manager does not match')
      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the guardians registry does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the treasury module does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the payments book module does not match')
    })

    it('allows to update other modules links', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.setModules([moduleId], [currentTreasury.address], [MODULE_IDS.disputes], targets, { from: modulesGovernor })

      assert.equal(await currentTreasury.linkedModules(MODULE_IDS.disputes), courtHelper.disputeManager.address, 'dispute manager linked of the treasury does not match')
      assert.equal(await currentTreasury.linkedModules(moduleId), ZERO_ADDRESS, 'treasury linked of the treasury does not match')

      assert.equal(await courtHelper.disputeManager.linkedModules(moduleId), currentTreasury.address, 'treasury linked of the dispute manager does not match')
      assert.equal(await courtHelper.treasury.linkedModules(moduleId), currentTreasury.address, 'treasury linked for the treasury module does not match')

      assert.equal(await courtHelper.guardiansRegistry.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the guardians registry does not match')
      assert.equal(await courtHelper.voting.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the voting module does not match')
      assert.equal(await courtHelper.paymentsBook.linkedModules(moduleId), previousTreasury.address, 'treasury linked for the payments book module does not match')
    })
  })
})
