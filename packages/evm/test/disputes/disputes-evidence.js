const { bn, bigExp, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper, DEFAULTS } = require('../helpers/wrappers/protocol')
const { DISPUTE_MANAGER_EVENTS } = require('../helpers/utils/events')
const { ARAGON_PROTOCOL_ERRORS, DISPUTE_MANAGER_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const Arbitrable = artifacts.require('Arbitrable')
const DisputeManager = artifacts.require('DisputeManager')

contract('DisputeManager', ([_, guardian500, guardian1000, guardian1500, fakeArbitrable]) => {
  let protocolHelper, protocol, disputeManager, arbitrable, disputeId

  const guardians = [
    { address: guardian500, initialActiveBalance: bigExp(500, 18) },
    { address: guardian1000, initialActiveBalance: bigExp(1000, 18) },
    { address: guardian1500, initialActiveBalance: bigExp(1500, 18) }
  ]

  before('create base contracts and activate guardians', async () => {
    protocolHelper = buildHelper()
    protocol = await protocolHelper.deploy()
    disputeManager = protocolHelper.disputeManager
    await protocolHelper.activate(guardians)
  })

  beforeEach('create dispute', async () => {
    arbitrable = await Arbitrable.new(protocol.address)
    disputeId = await protocolHelper.dispute({ arbitrable, closeEvidence: false })
  })

  describe('closeEvidencePeriod', () => {
    context('when the sender is the arbitrable of the dispute', () => {
      context('when the given dispute exists', () => {
        const itCanBeDrafted = () => {
          it('can be drafted', async () => {
            const draftedGuardians = await protocolHelper.draft({ disputeId })

            const totalWeight = draftedGuardians.reduce((total, { weight }) => total.add(weight), bn(0))
            assertBn(totalWeight, DEFAULTS.firstRoundGuardiansNumber, 'number of drafted guardians does not match')
          })
        }

        const itClosesEvidencePeriod = () => {
          let receipt, currentTermId

          beforeEach('close evidence period', async () => {
            currentTermId = await protocol.getCurrentTermId()
            receipt = await arbitrable.submitEvidence(disputeId, '0x', true)
          })

          it('closes the evidence period updating the draft term ID', async () => {
            const { draftTerm } = await protocolHelper.getRound(disputeId, 0)
            assertBn(draftTerm, currentTermId.add(bn(1)), 'round draft term does not match')

            const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.EVIDENCE_PERIOD_CLOSED)
            assertAmountOfEvents({ logs }, DISPUTE_MANAGER_EVENTS.EVIDENCE_PERIOD_CLOSED)
            assertEvent({ logs }, DISPUTE_MANAGER_EVENTS.EVIDENCE_PERIOD_CLOSED, { expectedArgs: { disputeId, termId: currentTermId } })
          })

          it('cannot be called twice', async () => {
            await assertRevert(arbitrable.submitEvidence(disputeId, '0x', true), DISPUTE_MANAGER_ERRORS.EVIDENCE_PERIOD_IS_CLOSED)
          })

          itCanBeDrafted()
        }

        context('when the current term is the dispute creation term', async () => {
          beforeEach('assert creation term', async () => {
            const currentTermId = await protocol.getCurrentTermId()
            const { createTermId } = await protocolHelper.getDispute(disputeId)
            assertBn(currentTermId, createTermId, 'current term does not match')
          })

          itClosesEvidencePeriod()
        })

        context('when the current term is after the dispute creation but within the evidence period', async () => {
          beforeEach('advance a few terms', async () => {
            await protocolHelper.passTerms(DEFAULTS.evidenceTerms.div(bn(2)))
            const currentTermId = await protocol.getCurrentTermId()
            const { createTermId } = await protocolHelper.getDispute(disputeId)
            const { draftTerm } = await protocolHelper.getRound(disputeId, 0)
            assert.isBelow(createTermId.toNumber(), currentTermId.toNumber(), 'current term does not match')
            assert.isBelow(currentTermId.toNumber(), draftTerm.toNumber(), 'current term does not match')
          })

          itClosesEvidencePeriod()
        })

        context('when the current term is at the end of the evidence period', async () => {
          beforeEach('advance a few terms', async () => {
            await protocolHelper.passTerms(DEFAULTS.evidenceTerms)
            const currentTermId = await protocol.getCurrentTermId()
            const { draftTerm } = await protocolHelper.getRound(disputeId, 0)
            assertBn(currentTermId, draftTerm, 'current term does not match')
          })

          it('reverts', async () => {
            await assertRevert(arbitrable.submitEvidence(disputeId, '0x', true), DISPUTE_MANAGER_ERRORS.EVIDENCE_PERIOD_IS_CLOSED)
          })

          itCanBeDrafted()
        })

        context('when the current term is after the evidence period', async () => {
          beforeEach('advance a few terms', async () => {
            await protocolHelper.passTerms(DEFAULTS.evidenceTerms.add(bn(1)))
            const currentTermId = await protocol.getCurrentTermId()
            const { draftTerm } = await protocolHelper.getRound(disputeId, 0)
            assertBn(currentTermId, draftTerm.add(bn(1)), 'current term does not match')
          })

          it('reverts', async () => {
            await assertRevert(arbitrable.submitEvidence(disputeId, '0x', true), DISPUTE_MANAGER_ERRORS.EVIDENCE_PERIOD_IS_CLOSED)
          })

          itCanBeDrafted()
        })
      })

      context('when the given dispute does not exist', () => {
        const disputeId = 1000

        it('reverts', async () => {
          await assertRevert(arbitrable.submitEvidence(disputeId, '0x', true), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
        })
      })
    })

    context('when the sender is not the arbitrable of the dispute', () => {
      it('reverts', async () => {
        await assertRevert(protocol.submitEvidence(disputeId, guardian500, '0x', { from: fakeArbitrable }), ARAGON_PROTOCOL_ERRORS.SENDER_NOT_DISPUTE_SUBJECT)
      })
    })

    context('when trying to call the disputes manager directly', () => {
      it('reverts', async () => {
        await assertRevert(disputeManager.closeEvidencePeriod(arbitrable.address, disputeId), CONTROLLED_ERRORS.SENDER_NOT_CONTROLLER)
      })
    })
  })
})
