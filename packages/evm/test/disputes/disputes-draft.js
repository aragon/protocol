const { toChecksumAddress } = require('web3-utils')
const { bn, bigExp, getEventAt, getEvents, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { advanceBlocks } = require('../helpers/utils/blocks')
const { DISPUTE_MANAGER_EVENTS, CLOCK_EVENTS } = require('../helpers/utils/events')
const { buildHelper, DEFAULTS, DISPUTE_STATES, ROUND_STATES } = require('../helpers/wrappers/protocol')
const { CLOCK_ERRORS, DISPUTE_MANAGER_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const DisputeManager = artifacts.require('DisputeManager')

contract('DisputeManager', ([_, drafter, guardian500, guardian1000, guardian1500, guardian2000, configGovernor, someone]) => {
  let protocolHelper, protocol, disputeManager

  const firstRoundGuardiansNumber = 5
  const guardians = [
    { address: guardian500,  initialActiveBalance: bigExp(500,  18) },
    { address: guardian1000, initialActiveBalance: bigExp(1000, 18) },
    { address: guardian1500, initialActiveBalance: bigExp(1500, 18) },
    { address: guardian2000, initialActiveBalance: bigExp(2000, 18) }
  ]

  beforeEach('create protocol', async () => {
    protocolHelper = buildHelper()
    protocol = await protocolHelper.deploy({ configGovernor, firstRoundGuardiansNumber })
    disputeManager = protocolHelper.disputeManager
  })

  describe('draft', () => {
    context('when the given dispute exists', () => {
      let disputeId
      const roundId = 0

      beforeEach('create dispute', async () => {
        await protocolHelper.activate(guardians)
        disputeId = await protocolHelper.dispute({ closeEvidence: false })
      })

      const itDraftsRequestedRoundInOneBatch = (guardiansToBeDrafted) => {
        const expectedDraftedGuardians = guardiansToBeDrafted > firstRoundGuardiansNumber ? firstRoundGuardiansNumber : guardiansToBeDrafted

        it('selects random guardians for the last round of the dispute', async () => {
          const receipt = await disputeManager.draft(disputeId, { from: drafter })

          const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)
          assertAmountOfEvents({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED, { expectedAmount: expectedDraftedGuardians })

          const guardiansAddresses = guardians.map(j => j.address)
          for (let i = 0; i < expectedDraftedGuardians; i++) {
            assertEvent({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED, { expectedArgs: { disputeId, roundId } })
            const { guardian } = getEventAt({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED, i).args
            assert.isTrue(guardiansAddresses.includes(toChecksumAddress(guardian)), 'drafted guardian is not included in the list')
          }
        })

        if (expectedDraftedGuardians === firstRoundGuardiansNumber) {
          it('ends the dispute draft', async () => {
            const receipt = await disputeManager.draft(disputeId, { from: drafter })

            assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.DISPUTE_STATE_CHANGED)
            assertEvent(receipt, DISPUTE_MANAGER_EVENTS.DISPUTE_STATE_CHANGED, { expectedArgs: { disputeId, state: DISPUTE_STATES.ADJUDICATING } })

            const { state, finalRuling } = await protocolHelper.getDispute(disputeId)
            assertBn(state, DISPUTE_STATES.ADJUDICATING, 'dispute state does not match')
            assertBn(finalRuling, 0, 'dispute final ruling does not match')
          })

          it('updates last round information', async () => {
            const currentTermId = await protocol.getCurrentTermId()
            const { draftTerm: draftTermId } = await protocolHelper.getRound(disputeId, roundId)

            await disputeManager.draft(disputeId, { from: drafter })

            const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, guardianFees, roundState } = await protocolHelper.getRound(disputeId, roundId)
            assertBn(draftTerm, draftTermId, 'round draft term does not match')
            assertBn(delayedTerms, currentTermId.sub(draftTermId), 'delayed terms do not match')
            assertBn(roundGuardiansNumber, firstRoundGuardiansNumber, 'round guardians number does not match')
            assertBn(selectedGuardians, firstRoundGuardiansNumber, 'selected guardians does not match')
            assertBn(guardianFees, protocolHelper.guardianFee.mul(bn(firstRoundGuardiansNumber)), 'round guardian fees do not match')
            assertBn(roundState, ROUND_STATES.COMMITTING, 'round state should be committing')
          })
        } else {
          it('does not end the dispute draft', async () => {
            const receipt = await disputeManager.draft(disputeId, { from: drafter })

            assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.DISPUTE_STATE_CHANGED, { expectedAmount: 0 })

            const { state, finalRuling } = await protocolHelper.getDispute(disputeId)
            assertBn(state, DISPUTE_STATES.PRE_DRAFT, 'dispute state does not match')
            assertBn(finalRuling, 0, 'dispute final ruling does not match')
          })

          it('updates last round information', async () => {
            const { draftTerm: draftTermId } = await protocolHelper.getRound(disputeId, roundId)

            await disputeManager.draft(disputeId, { from: drafter })

            const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, guardianFees, roundState } = await protocolHelper.getRound(disputeId, roundId)
            assertBn(draftTerm, draftTermId, 'round draft term does not match')
            assertBn(delayedTerms, 0, 'delayed terms do not match')
            assertBn(roundGuardiansNumber, firstRoundGuardiansNumber, 'round guardians number does not match')
            assertBn(selectedGuardians, expectedDraftedGuardians, 'selected guardians does not match')
            assertBn(guardianFees, protocolHelper.guardianFee.mul(bn(firstRoundGuardiansNumber)), 'round guardian fees do not match')
            assertBn(roundState, ROUND_STATES.INVALID, 'round state should be committing')
          })
        }

        it('sets the correct state for each guardian', async () => {
          const receipt = await disputeManager.draft(disputeId, { from: drafter })

          const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)
          const events = getEvents({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)

          for (let i = 0; i < guardians.length; i++) {
            const guardianAddress = guardians[i].address
            const expectedWeight = events.filter(({ args: { guardian } }) => toChecksumAddress(guardian) === guardianAddress).length
            const { weight, rewarded } = await protocolHelper.getRoundGuardian(disputeId, roundId, guardianAddress)

            assertBn(weight, expectedWeight, 'guardian weight does not match')
            assert.isFalse(rewarded, 'guardian should not have been rewarded yet')
          }
        })

        it('deposits the draft fee to the treasury for the caller', async () => {
          const { draftFee, treasury, feeToken } = protocolHelper
          const expectedFee = draftFee.mul(bn(expectedDraftedGuardians))

          const previousDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
          const previousTreasuryAmount = await feeToken.balanceOf(treasury.address)
          const previousDrafterAmount = await treasury.balanceOf(feeToken.address, drafter)

          await disputeManager.draft(disputeId, { from: drafter })

          const currentDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
          assertBn(currentDisputeManagerBalance, previousDisputeManagerBalance, 'dispute manager balances should remain the same')

          const currentTreasuryBalance = await feeToken.balanceOf(treasury.address)
          assertBn(currentTreasuryBalance, previousTreasuryAmount, 'treasury balances should remain the same')

          const currentDrafterBalance = await treasury.balanceOf(feeToken.address, drafter)
          assertBn(currentDrafterBalance, previousDrafterAmount.add(expectedFee), 'drafter amount does not match')
        })
      }

      const itDraftsRequestedRoundInMultipleBatches = (guardiansToBeDrafted, batches, guardiansPerBatch) => {
        it('selects random guardians for the last round of the dispute', async () => {
          const guardiansAddresses = guardians.map(j => j.address)

          for (let batch = 0, selectedGuardians = 0; batch < batches; batch++, selectedGuardians += guardiansPerBatch) {
            const receipt = await disputeManager.draft(disputeId, { from: drafter })

            const pendingGuardiansToBeDrafted = guardiansToBeDrafted - selectedGuardians
            const expectedDraftedGuardians = pendingGuardiansToBeDrafted < guardiansPerBatch ? pendingGuardiansToBeDrafted : guardiansPerBatch

            const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)
            assertAmountOfEvents({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED, { expectedAmount: expectedDraftedGuardians })

            for (let i = 0; i < expectedDraftedGuardians; i++) {
              const { disputeId: eventDisputeId, guardian } = getEventAt({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED, i).args
              assertBn(eventDisputeId, disputeId, 'dispute id does not match')
              assert.isTrue(guardiansAddresses.includes(toChecksumAddress(guardian)), 'drafted guardian is not included in the list')
            }

            // advance one term to avoid drafting all the batches in the same term
            if (batch + 1 < batches) await protocolHelper.passRealTerms(1)
          }
        })

        it('ends the dispute draft', async () => {
          let lastReceipt
          for (let batch = 0; batch < batches; batch++) {
            lastReceipt = await disputeManager.draft(disputeId, { from: drafter })

            // advance one term to avoid drafting all the batches in the same term
            if (batch + 1 < batches) await protocolHelper.passRealTerms(1)
          }

          assertAmountOfEvents(lastReceipt, DISPUTE_MANAGER_EVENTS.DISPUTE_STATE_CHANGED)
          assertEvent(lastReceipt, DISPUTE_MANAGER_EVENTS.DISPUTE_STATE_CHANGED, { expectedArgs: { disputeId, state: DISPUTE_STATES.ADJUDICATING } })

          const { state, finalRuling } = await protocolHelper.getDispute(disputeId)
          assertBn(state, DISPUTE_STATES.ADJUDICATING, 'dispute state does not match')
          assertBn(finalRuling, 0, 'dispute final ruling does not match')
        })

        it('updates last round information', async () => {
          const { draftTerm: draftTermId } = await protocolHelper.getRound(disputeId, roundId)

          let lastTerm
          for (let batch = 0; batch < batches; batch++) {
            await disputeManager.draft(disputeId, { from: drafter })
            lastTerm = await protocol.getLastEnsuredTermId()

            // advance one term to avoid drafting all the batches in the same term
            if (batch + 1 < batches) await protocolHelper.passRealTerms(1)
          }

          const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, guardianFees, roundState } = await protocolHelper.getRound(disputeId, roundId)

          assertBn(draftTerm, draftTermId, 'round draft term does not match')
          assertBn(delayedTerms, lastTerm - draftTermId, 'delayed terms do not match')
          assertBn(roundGuardiansNumber, firstRoundGuardiansNumber, 'round guardians number does not match')
          assertBn(selectedGuardians, firstRoundGuardiansNumber, 'selected guardians does not match')
          assertBn(guardianFees, protocolHelper.guardianFee.mul(bn(firstRoundGuardiansNumber)), 'round guardian fees do not match')
          assertBn(roundState, ROUND_STATES.COMMITTING, 'round state should be committing')
        })

        it('sets the correct state for each guardian', async () => {
          const expectedWeights = {}

          for (let batch = 0; batch < batches; batch++) {
            const receipt = await disputeManager.draft(disputeId, { from: drafter })

            const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)
            const events = getEvents({ logs }, DISPUTE_MANAGER_EVENTS.GUARDIAN_DRAFTED)

            for (let i = 0; i < guardians.length; i++) {
              const guardianAddress = guardians[i].address
              const batchWeight = events.filter(({ args: { guardian } }) => toChecksumAddress(guardian) === guardianAddress).length
              expectedWeights[guardianAddress] = (expectedWeights[guardianAddress] || 0) + batchWeight
            }

            // advance one term to avoid drafting all the batches in the same term
            if (batch + 1 < batches) await protocolHelper.passRealTerms(1)
          }

          for (let i = 0; i < guardians.length; i++) {
            const guardianAddress = guardians[i].address
            const { weight, rewarded } = await disputeManager.getGuardian(disputeId, roundId, guardianAddress)

            assertBn(weight, expectedWeights[guardianAddress], `guardian ${guardianAddress} weight does not match`)
            assert.isFalse(rewarded, 'guardian should not have been rewarded yet')
          }
        })

        it('deposits the draft fee to the treasury for the caller', async () => {
          const { draftFee, treasury, feeToken } = protocolHelper

          for (let batch = 0, selectedGuardians = 0; batch < batches; batch++, selectedGuardians += guardiansPerBatch) {
            const previousDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
            const previousTreasuryAmount = await feeToken.balanceOf(treasury.address)
            const previousDrafterAmount = await treasury.balanceOf(feeToken.address, drafter)

            await disputeManager.draft(disputeId, { from: drafter })

            const currentDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
            assertBn(currentDisputeManagerBalance, previousDisputeManagerBalance, 'dispute manager balances should remain the same')

            const currentTreasuryAmount = await feeToken.balanceOf(treasury.address)
            assertBn(currentTreasuryAmount, previousTreasuryAmount, 'treasury balances should remain the same')

            const pendingGuardiansToBeDrafted = guardiansToBeDrafted - selectedGuardians
            const expectedDraftedGuardians = pendingGuardiansToBeDrafted < guardiansPerBatch ? pendingGuardiansToBeDrafted : guardiansPerBatch
            const expectedFee = draftFee.mul(bn(expectedDraftedGuardians))
            const currentDrafterAmount = await treasury.balanceOf(feeToken.address, drafter)
            assertBn(currentDrafterAmount, previousDrafterAmount.add(expectedFee), 'drafter amount does not match')

            // advance one term to avoid drafting all the batches in the same term
            if (batch + 1 < batches) await protocolHelper.passRealTerms(1)
          }
        })
      }

      const itHandlesDraftsProperlyForDifferentRequestedGuardiansNumber = () => {
        context('when drafting all the requested guardians', () => {
          context('when drafting in one batch', () => {
            const maxGuardiansPerDraftBatch = firstRoundGuardiansNumber

            beforeEach('set max number of guardians to be drafted per batch', async () => {
              await disputeManager.setMaxGuardiansPerDraftBatch(maxGuardiansPerDraftBatch, { from: configGovernor })
            })

            itDraftsRequestedRoundInOneBatch(maxGuardiansPerDraftBatch)
          })

          context('when drafting in multiple batches', () => {
            const batches = 2, maxGuardiansPerDraftBatch = 4

            beforeEach('set max number of guardians to be drafted per batch', async () => {
              await disputeManager.setMaxGuardiansPerDraftBatch(maxGuardiansPerDraftBatch, { from: configGovernor })
            })

            itDraftsRequestedRoundInMultipleBatches(firstRoundGuardiansNumber, batches, maxGuardiansPerDraftBatch)
          })
        })

        context('when half amount of the requested guardians', () => {
          const maxGuardiansPerDraftBatch = Math.floor(firstRoundGuardiansNumber / 2)

          beforeEach('set max number of guardians to be drafted per batch', async () => {
            await disputeManager.setMaxGuardiansPerDraftBatch(maxGuardiansPerDraftBatch, { from: configGovernor })
          })

          itDraftsRequestedRoundInOneBatch(maxGuardiansPerDraftBatch)
        })

        context('when drafting more than the requested guardians', () => {
          const maxGuardiansPerDraftBatch = firstRoundGuardiansNumber * 2

          beforeEach('set max number of guardians to be drafted per batch', async () => {
            await disputeManager.setMaxGuardiansPerDraftBatch(maxGuardiansPerDraftBatch, { from: configGovernor })
          })

          itDraftsRequestedRoundInOneBatch(maxGuardiansPerDraftBatch)
        })
      }

      const itHandlesDraftsProperlyForDifferentBlockNumbers = () => {
        const advanceBlocksAfterDraftBlockNumber = async blocks => {
          // NOTE: To test this scenario we cannot mock the blocknumber, we need a real block mining to have different blockhashes
          const currentTermId = await protocol.getCurrentTermId()
          const { randomnessBN } = await protocol.getTerm(currentTermId)
          const currentBlockNumber = await protocol.getBlockNumberExt()
          const outdatedBlocks = currentBlockNumber.toNumber() - randomnessBN.toNumber()
          if (outdatedBlocks <= blocks) await advanceBlocks(blocks - outdatedBlocks)
        }

        context('when the current block is the randomness block number', () => {
          beforeEach('mock current block number', async () => {
            const { draftTerm } = await protocolHelper.getRound(disputeId, roundId)
            const { randomnessBN } = await protocol.getTerm(draftTerm)
            await protocol.mockSetBlockNumber(randomnessBN)
          })

          it('reverts', async () => {
            await assertRevert(disputeManager.draft(disputeId, { from: drafter }), CLOCK_ERRORS.TERM_RANDOMNESS_NOT_YET)
          })
        })

        context('when the current block is the following block of the randomness block number', () => {
          // no need to move one block since the `beforeEach` block will hit the next block

          itHandlesDraftsProperlyForDifferentRequestedGuardiansNumber()
        })

        context('when the current term is after the randomness block number by less than 256 blocks', () => {
          beforeEach('move 15 blocks after the draft term block number', async () => {
            await advanceBlocksAfterDraftBlockNumber(15)
          })

          itHandlesDraftsProperlyForDifferentRequestedGuardiansNumber()
        })

        context('when the current term is after the randomness block number by 256 blocks', () => {
          beforeEach('move 256 blocks after the draft term block number', async () => {
            // moving 254 blocks instead of 256 since the `beforeEach` block will hit two more blocks
            await advanceBlocksAfterDraftBlockNumber(254)
          })

          itHandlesDraftsProperlyForDifferentRequestedGuardiansNumber()
        })

        context('when the current term is after the randomness block number by more than 256 blocks', () => {
          beforeEach('move 257 blocks after the draft term block number', async () => {
            await advanceBlocksAfterDraftBlockNumber(257)
          })

          it('reverts', async () => {
            await assertRevert(disputeManager.draft(disputeId, { from: drafter }), CLOCK_ERRORS.TERM_RANDOMNESS_UNAVAILABLE)
          })

          context('when the clock advances to the next term', () => {
            beforeEach('move to the next term', async () => {
              await protocolHelper.passRealTerms(1)
            })

            itHandlesDraftsProperlyForDifferentRequestedGuardiansNumber()
          })
        })
      }

      const itHandlesDraftsProperly = () => {
        context('when the given dispute was not drafted', () => {
          beforeEach('move to the draft term', async () => {
            const neededTransitions = await protocol.getNeededTermTransitions()
            if (neededTransitions.gt(bn(0))) await protocol.heartbeat(neededTransitions)
          })

          context('when the protocol term is up-to-date', () => {
            itHandlesDraftsProperlyForDifferentBlockNumbers()
          })

          context('when the protocol term is outdated by one term', () => {
            beforeEach('increase one term', async () => {
              await protocolHelper.increaseTimeInTerms(1)
            })

            context('when the heartbeat was not executed', () => {
              it('reverts', async () => {
                await assertRevert(disputeManager.draft(disputeId, { from: drafter }), DISPUTE_MANAGER_ERRORS.TERM_OUTDATED)
              })
            })

            context('when the heartbeat was executed', () => {
              let lastEnsuredTermId, receipt

              beforeEach('call heartbeat', async () => {
                lastEnsuredTermId = await protocol.getLastEnsuredTermId()
                receipt = await protocol.heartbeat(1, { from: drafter })
              })

              it('transitions 1 term', async () => {
                assertAmountOfEvents(receipt, CLOCK_EVENTS.HEARTBEAT, { expectedAmount: 1 })
                assertEvent(receipt, CLOCK_EVENTS.HEARTBEAT, { expectedArgs: { previousTermId: lastEnsuredTermId, currentTermId: lastEnsuredTermId.add(bn(1)) } })
              })

              itHandlesDraftsProperlyForDifferentBlockNumbers()
            })
          })

          context('when the protocol term is outdated by more than one term', () => {
            beforeEach('increase two terms', async () => {
              await protocolHelper.increaseTimeInTerms(2)
            })

            it('reverts', async () => {
              await assertRevert(disputeManager.draft(disputeId, { from: drafter }), DISPUTE_MANAGER_ERRORS.TERM_OUTDATED)
            })
          })
        })

        context('when the given dispute was already drafted', () => {
          beforeEach('draft dispute', async () => {
            const neededTransitions = await protocol.getNeededTermTransitions()
            if (neededTransitions.gt(bn(0))) await protocol.heartbeat(neededTransitions)
            await advanceBlocks(3) // advance some blocks to ensure term randomness

            await disputeManager.draft(disputeId, { from: drafter })
          })

          it('reverts', async () => {
            await assertRevert(disputeManager.draft(disputeId, { from: drafter }), DISPUTE_MANAGER_ERRORS.ROUND_ALREADY_DRAFTED)
          })
        })
      }

      context('when the evidence period is still open', () => {
        it('reverts', async () => {
          await assertRevert(disputeManager.draft(disputeId, { from: drafter }), DISPUTE_MANAGER_ERRORS.ERROR_DRAFT_TERM_NOT_REACHED_DOES_NOT_EXIST)
        })
      })

      context('when the evidence period is closed', () => {
        beforeEach('close evidence period', async () => {
          await protocolHelper.passRealTerms(DEFAULTS.evidenceTerms)
        })

        context('when the current term is the draft term', () => {
          itHandlesDraftsProperly()
        })

        context('when the current term is after the draft term', () => {
          beforeEach('delay some terms', async () => {
            await protocolHelper.increaseTimeInTerms(10)
          })

          itHandlesDraftsProperly()
        })
      })
    })

    context('when the given dispute does not exist', () => {
      it('reverts', async () => {
        await assertRevert(disputeManager.draft(0), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
      })
    })
  })

  describe('setMaxGuardiansPerDraftBatch', () => {
    context('when the sender is the governor config', () => {
      const from = configGovernor

      context('when the given value is greater than zero', () => {
        const newGuardiansPerDraftBatch = bn(20)

        it('updates the max number of guardians per draft batch', async () => {
          await disputeManager.setMaxGuardiansPerDraftBatch(newGuardiansPerDraftBatch, { from })

          const maxGuardiansPerDraftBatch = await disputeManager.maxGuardiansPerDraftBatch()
          assertBn(maxGuardiansPerDraftBatch, newGuardiansPerDraftBatch, 'max draft batch size was not properly set')
        })

        it('emits an event', async () => {
          const receipt = await disputeManager.setMaxGuardiansPerDraftBatch(newGuardiansPerDraftBatch, { from })

          assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.MAX_GUARDIANS_PER_DRAFT_BATCH_CHANGED)
          assertEvent(receipt, DISPUTE_MANAGER_EVENTS.MAX_GUARDIANS_PER_DRAFT_BATCH_CHANGED, { expectedArgs: { maxGuardiansPerDraftBatch: newGuardiansPerDraftBatch } })
        })
      })

      context('when the given value is greater than zero', () => {
        const newGuardiansPerDraftBatch = bn(0)

        it('reverts', async () => {
          await assertRevert(disputeManager.setMaxGuardiansPerDraftBatch(newGuardiansPerDraftBatch, { from }), DISPUTE_MANAGER_ERRORS.BAD_MAX_DRAFT_BATCH_SIZE)
        })
      })
    })

    context('when the sender is not the governor config', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(disputeManager.setMaxGuardiansPerDraftBatch(bn(0), { from }), CONTROLLED_ERRORS.SENDER_NOT_CONFIG_GOVERNOR)
      })
    })
  })
})
