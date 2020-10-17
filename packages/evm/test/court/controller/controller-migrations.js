const { assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../../helpers/wrappers/court')
const { MODULE_IDS, getCachedAddress } = require('../../helpers/utils/modules')
const { CONTROLLED_ERRORS, DISPUTE_MANAGER_ERRORS } = require('../../helpers/utils/errors')

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
      await court.setModule(moduleId, currentGuardiansRegistry.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousGuardiansRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousGuardiansRegistry.address, 'registry cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousGuardiansRegistry.address, 'registry cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousGuardiansRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousGuardiansRegistry.address, 'registry cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentGuardiansRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentGuardiansRegistry.address, 'registry cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousGuardiansRegistry.address, 'registry cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousGuardiansRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousGuardiansRegistry.address, 'registry cached for the payments book module does not match')
    })
  })

  context('when migrating the payments module', () => {
    let previousPaymentsBook, currentPaymentsBook, moduleId = MODULE_IDS.payments

    beforeEach('load dispute managers', async () => {
      previousPaymentsBook = courtHelper.paymentsBook
      currentPaymentsBook = await PaymentsBook.new(court.address, courtHelper.paymentPeriodDuration, courtHelper.paymentsGovernorSharePct)
      await court.setModule(moduleId, currentPaymentsBook.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousPaymentsBook.address, 'payments book cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousPaymentsBook.address, 'payments book cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousPaymentsBook.address, 'payments book cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousPaymentsBook.address, 'payments book cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousPaymentsBook.address, 'payments book cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentPaymentsBook.address, 'payments book cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentPaymentsBook.address, 'payments book cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousPaymentsBook.address, 'payments book cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousPaymentsBook.address, 'payments book cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousPaymentsBook.address, 'payments book cached for the payments book module does not match')
    })
  })

  context('when migrating the voting module', () => {
    let previousVoting, currentVoting, moduleId = MODULE_IDS.voting

    beforeEach('load dispute managers', async () => {
      previousVoting = courtHelper.voting
      currentVoting = await Voting.new(court.address)
      await court.setModule(moduleId, currentVoting.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousVoting.address, 'voting cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousVoting.address, 'voting cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousVoting.address, 'voting cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousVoting.address, 'voting cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentVoting.address, 'voting cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentVoting.address, 'voting cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousVoting.address, 'voting cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousVoting.address, 'voting cached for the payments book module does not match')
    })
  })

  context('when migrating the treasury module', () => {
    let previousTreasury, currentTreasury, moduleId = MODULE_IDS.treasury

    beforeEach('load dispute managers', async () => {
      previousTreasury = courtHelper.treasury
      currentTreasury = await Treasury.new(court.address)
      await court.setModule(moduleId, currentTreasury.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousTreasury.address, 'treasury cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousTreasury.address, 'treasury cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousTreasury.address, 'treasury cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousTreasury.address, 'treasury cached for the payments book module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentTreasury.address, 'treasury cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentTreasury.address, 'treasury cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.guardiansRegistry, moduleId), previousTreasury.address, 'treasury cached for the guardians registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.paymentsBook, moduleId), previousTreasury.address, 'treasury cached for the payments book module does not match')
    })
  })
})
