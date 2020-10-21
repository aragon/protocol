const { assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../../helpers/wrappers/court')
const { MODULE_IDS, getCachedAddress } = require('../../helpers/utils/modules')
const { CONTROLLED_ERRORS, DISPUTE_MANAGER_ERRORS } = require('../../helpers/utils/errors')

const DisputeManager = artifacts.require('DisputeManager')
const JurorsRegistry = artifacts.require('JurorsRegistry')
const Treasury = artifacts.require('CourtTreasury')
const Voting = artifacts.require('CRVoting')
const Subscriptions = artifacts.require('CourtSubscriptions')

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

  context('when migrating the jurors registry', () => {
    let previousJurorsRegistry, currentJurorsRegistry, moduleId = MODULE_IDS.registry

    beforeEach('load dispute managers', async () => {
      previousJurorsRegistry = courtHelper.jurorsRegistry
      currentJurorsRegistry = await JurorsRegistry.new(court.address, courtHelper.jurorToken.address, 1)
      await court.setModule(moduleId, currentJurorsRegistry.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousJurorsRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousJurorsRegistry.address, 'registry cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousJurorsRegistry.address, 'registry cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousJurorsRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousJurorsRegistry.address, 'registry cached for the subscriptions module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentJurorsRegistry.address, 'registry cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentJurorsRegistry.address, 'registry cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousJurorsRegistry.address, 'registry cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousJurorsRegistry.address, 'registry cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousJurorsRegistry.address, 'registry cached for the subscriptions module does not match')
    })
  })

  context('when migrating the subscriptions module', () => {
    let previousSubscriptions, currentSubscriptions, moduleId = MODULE_IDS.subscriptions

    beforeEach('load dispute managers', async () => {
      previousSubscriptions = courtHelper.subscriptions
      currentSubscriptions = await Subscriptions.new(court.address, courtHelper.subscriptionPeriodDuration, courtHelper.feeToken.address, courtHelper.subscriptionGovernorSharePct)
      await court.setModule(moduleId, currentSubscriptions.address, { from: modulesGovernor })
    })

    it('does not affect modules cache', async () => {
      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), previousSubscriptions.address, 'subscriptions cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousSubscriptions.address, 'subscriptions cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousSubscriptions.address, 'subscriptions cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousSubscriptions.address, 'subscriptions cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousSubscriptions.address, 'subscriptions cached for the subscriptions module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentSubscriptions.address, 'subscriptions cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentSubscriptions.address, 'subscriptions cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousSubscriptions.address, 'subscriptions cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousSubscriptions.address, 'subscriptions cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousSubscriptions.address, 'subscriptions cached for the subscriptions module does not match')
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
      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousVoting.address, 'voting cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousVoting.address, 'voting cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousVoting.address, 'voting cached for the subscriptions module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentVoting.address, 'voting cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentVoting.address, 'voting cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousVoting.address, 'voting cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousVoting.address, 'voting cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousVoting.address, 'voting cached for the subscriptions module does not match')
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
      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousTreasury.address, 'treasury cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), previousTreasury.address, 'treasury cached for the treasury module does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousTreasury.address, 'treasury cached for the subscriptions module does not match')
    })

    it('allows to update other modules cache', async () => {
      const targets = [courtHelper.disputeManager.address, courtHelper.treasury.address]
      await court.cacheModules(targets, [moduleId], { from: modulesGovernor })

      assert.equal(await getCachedAddress(courtHelper.disputeManager, moduleId), currentTreasury.address, 'treasury cached of the dispute manager does not match')
      assert.equal(await getCachedAddress(courtHelper.treasury, moduleId), currentTreasury.address, 'treasury cached for the treasury module does not match')

      assert.equal(await getCachedAddress(courtHelper.jurorsRegistry, moduleId), previousTreasury.address, 'treasury cached for the jurors registry does not match')
      assert.equal(await getCachedAddress(courtHelper.voting, moduleId), previousTreasury.address, 'treasury cached for the voting module does not match')
      assert.equal(await getCachedAddress(courtHelper.subscriptions, moduleId), previousTreasury.address, 'treasury cached for the subscriptions module does not match')
    })
  })
})