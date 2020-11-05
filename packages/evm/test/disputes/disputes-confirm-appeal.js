const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { DISPUTE_MANAGER_ERRORS } = require('../helpers/utils/errors')
const { DISPUTE_MANAGER_EVENTS } = require('../helpers/utils/events')
const { oppositeOutcome, outcomeFor, OUTCOMES } = require('../helpers/utils/crvoting')
const { buildHelper, DEFAULTS, ROUND_STATES, DISPUTE_STATES } = require('../helpers/wrappers/protocol')

contract('DisputeManager', ([_, drafter, appealMaker, appealTaker, guardian500, guardian1000, guardian1500, guardian2000, guardian2500, guardian3000, guardian3500, guardian4000]) => {
  let protocolHelper, protocol, disputeManager

  const guardians = [
    { address: guardian3000, initialActiveBalance: bigExp(3000, 18) },
    { address: guardian500,  initialActiveBalance: bigExp(500,  18) },
    { address: guardian1000, initialActiveBalance: bigExp(1000, 18) },
    { address: guardian2000, initialActiveBalance: bigExp(2000, 18) },
    { address: guardian4000, initialActiveBalance: bigExp(4000, 18) },
    { address: guardian1500, initialActiveBalance: bigExp(1500, 18) },
    { address: guardian3500, initialActiveBalance: bigExp(3500, 18) },
    { address: guardian2500, initialActiveBalance: bigExp(2500, 18) }
  ]

  before('create base contracts and activate guardians', async () => {
    protocolHelper = buildHelper()
    protocol = await protocolHelper.deploy()
    disputeManager = protocolHelper.disputeManager
    await protocolHelper.activate(guardians)
  })

  describe('confirmAppeal', () => {
    context('when the given dispute exists', () => {
      let disputeId

      beforeEach('activate guardians and create dispute', async () => {
        disputeId = await protocolHelper.dispute()
      })

      context('when the given round is valid', () => {
        let voters

        const itIsAtState = (roundId, state) => {
          it(`round is at state ${state}`, async () => {
            const { roundState } = await protocolHelper.getRound(disputeId, roundId)
            assertBn(roundState, state, 'round state does not match')
          })
        }

        const itFailsToConfirmAppeal = (roundId, reason = DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE) => {
          it('fails to confirm appeals', async () => {
            await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, OUTCOMES.REFUSED), reason)
          })
        }

        context('for a regular round', () => {
          const roundId = 0
          let draftedGuardians

          beforeEach('draft round', async () => {
            draftedGuardians = await protocolHelper.draft({ disputeId, drafter })
          })

          beforeEach('define a group of voters', async () => {
            // pick the first 3 drafted guardians to vote
            voters = draftedGuardians.slice(0, 3)
            voters.forEach((voter, i) => voter.outcome = outcomeFor(i))
          })

          context('during commit period', () => {
            itIsAtState(roundId, ROUND_STATES.COMMITTING)
            itFailsToConfirmAppeal(roundId)
          })

          context('during reveal period', () => {
            beforeEach('commit votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.REVEALING)
            itFailsToConfirmAppeal(roundId)
          })

          context('during appeal period', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)
            itFailsToConfirmAppeal(roundId)
          })

          context('during the appeal confirmation period', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal period', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms)
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itFailsToConfirmAppeal(roundId)
            })

            context('when the round was appealed', () => {
              let appealMakerRuling

              beforeEach('appeal and move to appeal confirmation period', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker })
                const { appealedRuling } = await protocolHelper.getAppeal(disputeId, roundId)
                appealMakerRuling = appealedRuling
              })

              context('when the confirmed ruling is valid', () => {
                let appealTakerRuling

                context('when the confirmed ruling is different from the appealed one', () => {
                  beforeEach('set confirmed ruling', async () => {
                    appealTakerRuling = oppositeOutcome(appealMakerRuling)
                  })

                  context('when the appeal taker has enough balance', () => {
                    beforeEach('mint fee tokens for appeal taker', async () => {
                      const { confirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)
                      await protocolHelper.mintAndApproveFeeTokens(appealTaker, disputeManager.address, confirmAppealDeposit)
                    })

                    const itCreatesNewRoundSuccessfully = roundId => {
                      it('computes next round details successfully', async () => {
                        const { nextRoundStartTerm, nextRoundGuardiansNumber, newDisputeState, feeToken, totalFees, guardianFees, appealDeposit, confirmAppealDeposit } = await disputeManager.getNextRoundDetails(disputeId, roundId)

                        const expectedStartTerm = await protocolHelper.getNextRoundStartTerm(disputeId, roundId)
                        assertBn(nextRoundStartTerm, expectedStartTerm, 'next round start term does not match')

                        const expectedGuardiansNumber = await protocolHelper.getNextRoundGuardiansNumber(disputeId, roundId)
                        assertBn(nextRoundGuardiansNumber, expectedGuardiansNumber, 'next round guardians number does not match')

                        const expectedDisputeState = (roundId < protocolHelper.maxRegularAppealRounds.toNumber() - 1) ? DISPUTE_STATES.PRE_DRAFT : DISPUTE_STATES.ADJUDICATING
                        assertBn(newDisputeState, expectedDisputeState, 'next round guardians number does not match')

                        const expectedGuardianFees = await protocolHelper.getNextRoundGuardianFees(disputeId, roundId)
                        assertBn(guardianFees, expectedGuardianFees, 'guardian fees does not match')

                        const { appealFees, appealDeposit: expectedAppealDeposit, confirmAppealDeposit: expectedConfirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)
                        assert.equal(feeToken, protocolHelper.feeToken.address, 'fee token does not match')
                        assertBn(totalFees, appealFees, 'appeal fees does not match')
                        assertBn(appealDeposit, expectedAppealDeposit, 'appeal deposit does not match')
                        assertBn(confirmAppealDeposit, expectedConfirmAppealDeposit, 'confirm appeal deposit does not match')
                      })

                      it('computes final guardians number nevertheless the current term', async () => {
                        const previousTermId = await protocol.getCurrentTermId()
                        const previousActiveBalance = await protocolHelper.guardiansRegistry.totalActiveBalanceAt(previousTermId)
                        const previousGuardiansNumber = await protocolHelper.getNextRoundGuardiansNumber(disputeId, roundId)

                        await protocolHelper.passTerms(bn(1))
                        await protocolHelper.activate(guardians)
                        await protocolHelper.passTerms(bn(1))

                        const currentTermId = await protocol.getCurrentTermId()
                        const currentActiveBalance = await protocolHelper.guardiansRegistry.totalActiveBalanceAt(currentTermId)
                        const expectedIncrease = guardians.reduce((total, { initialActiveBalance }) => total.add(initialActiveBalance), bn(0))
                        assertBn(currentActiveBalance, previousActiveBalance.add(expectedIncrease), 'new total active balance does not match')

                        if (roundId < DEFAULTS.maxRegularAppealRounds.toNumber() - 1) {
                          const currentGuardiansNumber = await protocolHelper.getNextRoundGuardiansNumber(disputeId, roundId)
                          assertBn(currentGuardiansNumber, previousGuardiansNumber, 'next round guardians number does not match')
                        } else {
                          const currentGuardiansNumber = await protocolHelper.getNextRoundGuardiansNumber(disputeId, roundId)
                          const expectedGuardiansNumber = currentActiveBalance.mul(DEFAULTS.finalRoundWeightPrecision).div(DEFAULTS.minActiveBalance)
                          assertBn(currentGuardiansNumber, expectedGuardiansNumber, 'next round guardians number does not match')
                        }
                      })

                      it('emits an event', async () => {
                        const receipt = await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.RULING_APPEAL_CONFIRMED)

                        const nextRoundStartTerm = await protocolHelper.getNextRoundStartTerm(disputeId, roundId)
                        assertEvent(receipt, DISPUTE_MANAGER_EVENTS.RULING_APPEAL_CONFIRMED, { disputeId, roundId: roundId + 1, draftTermId: nextRoundStartTerm })
                      })

                      it('confirms the given appealed round', async () => {
                        await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        const { appealer, appealedRuling, taker, opposedRuling } = await protocolHelper.getAppeal(disputeId, roundId)
                        assert.equal(appealer, appealMaker, 'appeal maker does not match')
                        assertBn(appealedRuling, appealMakerRuling, 'appealed ruling does not match')
                        assertBn(taker, appealTaker, 'appeal taker does not match')
                        assertBn(opposedRuling, appealTakerRuling, 'opposed ruling does not match')
                      })

                      it('creates a new round for the given dispute', async () => {
                        await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, settledPenalties, guardianFees, collectedTokens } = await protocolHelper.getRound(disputeId, roundId + 1)

                        const nextRoundStartTerm = await protocolHelper.getNextRoundStartTerm(disputeId, roundId)
                        assertBn(draftTerm, nextRoundStartTerm, 'new round draft term does not match')
                        assertBn(delayedTerms, 0, 'new round delay term does not match')

                        const nextRoundGuardiansNumber = await protocolHelper.getNextRoundGuardiansNumber(disputeId, roundId)
                        assertBn(roundGuardiansNumber, nextRoundGuardiansNumber, 'new round guardians number does not match')

                        const nextRoundGuardianFees = await protocolHelper.getNextRoundGuardianFees(disputeId, roundId)
                        assertBn(guardianFees, nextRoundGuardianFees, 'new round guardian fees do not match')

                        assertBn(selectedGuardians, 0, 'new round selected guardians number does not match')
                        assertBn(collectedTokens, 0, 'new round collected tokens should be zero')
                        assert.equal(settledPenalties, false, 'new round penalties should not be settled')
                      })

                      it('does not modify the current round of the dispute', async () => {
                        const { draftTerm: previousDraftTerm, delayedTerms: previousDelayedTerms, roundGuardiansNumber: previousGuardiansNumber, guardianFees: previousGuardianFees } = await protocolHelper.getRound(disputeId, roundId)

                        await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, guardianFees, settledPenalties, collectedTokens } = await protocolHelper.getRound(disputeId, roundId)
                        assertBn(draftTerm, previousDraftTerm, 'current round draft term does not match')
                        assertBn(delayedTerms, previousDelayedTerms, 'current round delay term does not match')
                        assertBn(roundGuardiansNumber, previousGuardiansNumber, 'current round guardians number does not match')
                        assertBn(selectedGuardians, previousGuardiansNumber, 'current round selected guardians number does not match')
                        assertBn(guardianFees, previousGuardianFees, 'current round guardian fees do not match')
                        assert.equal(settledPenalties, false, 'current round penalties should not be settled')
                        assertBn(collectedTokens, 0, 'current round collected tokens should be zero')
                      })

                      it('updates the dispute state', async () => {
                        await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        const { possibleRulings, state, finalRuling } = await protocolHelper.getDispute(disputeId)

                        const expectedDisputeState = (roundId < protocolHelper.maxRegularAppealRounds.toNumber() - 1) ? DISPUTE_STATES.PRE_DRAFT : DISPUTE_STATES.ADJUDICATING
                        assertBn(state, expectedDisputeState, 'dispute state does not match')
                        assertBn(possibleRulings, 2, 'dispute possible rulings do not match')
                        assertBn(finalRuling, 0, 'dispute final ruling does not match')
                      })

                      it('cannot be confirmed twice', async () => {
                        await disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker })

                        await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker }), DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
                      })
                    }

                    context('when the next round is a regular round', () => {
                      itCreatesNewRoundSuccessfully(roundId)
                    })

                    context('when the next round is a final round', () => {
                      const finalRoundId = DEFAULTS.maxRegularAppealRounds.toNumber()

                      beforeEach('move to final round', async () => {
                        // appeal until we reach the final round, always flipping the previous round winning ruling
                        for (let nextRoundId = roundId + 1; nextRoundId < finalRoundId; nextRoundId++) {
                          await protocolHelper.confirmAppeal({ disputeId, roundId: nextRoundId - 1, appealTaker, ruling: appealTakerRuling })
                          const roundVoters = await protocolHelper.draft({ disputeId })
                          roundVoters.forEach(voter => voter.outcome = appealTakerRuling)
                          await protocolHelper.commit({ disputeId, roundId: nextRoundId, voters: roundVoters })
                          await protocolHelper.reveal({ disputeId, roundId: nextRoundId, voters: roundVoters })
                          await protocolHelper.appeal({ disputeId, roundId: nextRoundId, appealMaker, ruling: appealMakerRuling })
                        }

                        // mint fee tokens for last appeal taker
                        const { confirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, finalRoundId - 1)
                        await protocolHelper.mintAndApproveFeeTokens(appealTaker, disputeManager.address, confirmAppealDeposit)
                      })

                      itCreatesNewRoundSuccessfully(finalRoundId - 1)
                    })
                  })

                  context('when the appeal taker does not have enough balance', () => {
                    it('reverts', async () => {
                      await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, appealTakerRuling, { from: appealTaker }), DISPUTE_MANAGER_ERRORS.DEPOSIT_FAILED)
                    })
                  })
                })

                context('when the confirmed ruling is equal to the appealed one', () => {
                  beforeEach('set confirmed ruling', async () => {
                    appealTakerRuling = appealMakerRuling
                  })

                  it('reverts', async () => {
                    await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, appealMakerRuling, { from: appealTaker }), DISPUTE_MANAGER_ERRORS.INVALID_APPEAL_RULING)
                  })
                })
              })

              context('when the confirmed ruling is not valid', () => {
                const invalidRuling = 10

                it('reverts', async () => {
                  await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, invalidRuling, { from: appealTaker }), DISPUTE_MANAGER_ERRORS.INVALID_APPEAL_RULING)
                })
              })
            })
          })

          context('after the appeal confirmation period', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal and confirmation periods', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itFailsToConfirmAppeal(roundId)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker })
              })

              context('when the appeal was not confirmed', () => {
                beforeEach('pass confirmation period', async () => {
                  await protocolHelper.passTerms(protocolHelper.appealConfirmTerms)
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToConfirmAppeal(roundId)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await protocolHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToConfirmAppeal(roundId)
              })
            })
          })
        })

        context('for a final round', () => {
          const roundId = DEFAULTS.maxRegularAppealRounds.toNumber()

          beforeEach('move to final round', async () => {
            await protocolHelper.moveToFinalRound({ disputeId })
          })

          beforeEach('define a group of voters', async () => {
            voters = [
              { address: guardian1000, outcome: OUTCOMES.LOW },
              { address: guardian4000, outcome: OUTCOMES.LOW },
              { address: guardian2000, outcome: OUTCOMES.HIGH },
              { address: guardian1500, outcome: OUTCOMES.REFUSED }
            ]
          })

          const itCannotComputeNextRoundDetails = () => {
            it('cannot compute next round details', async () => {
              await assertRevert(disputeManager.getNextRoundDetails(disputeId, roundId), DISPUTE_MANAGER_ERRORS.ROUND_IS_FINAL)
            })
          }

          context('during commit period', () => {
            itIsAtState(roundId, ROUND_STATES.COMMITTING)
            itFailsToConfirmAppeal(roundId)
            itCannotComputeNextRoundDetails()
          })

          context('during reveal period', () => {
            beforeEach('commit votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.REVEALING)
            itFailsToConfirmAppeal(roundId)
            itCannotComputeNextRoundDetails()
          })

          context('during appeal period', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToConfirmAppeal(roundId)
            itCannotComputeNextRoundDetails()
          })

          context('during the appeal confirmation period', () => {
            beforeEach('commit and reveal votes, and pass appeal period', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
              await protocolHelper.passTerms(protocolHelper.appealTerms)
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToConfirmAppeal(roundId)
            itCannotComputeNextRoundDetails()
          })

          context('after the appeal confirmation period', () => {
            beforeEach('commit and reveal votes, and pass appeal and confirmation periods', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
              await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToConfirmAppeal(roundId)
            itCannotComputeNextRoundDetails()
          })
        })
      })

      context('when the given round is not valid', () => {
        const roundId = 5

        it('reverts', async () => {
          await assertRevert(disputeManager.confirmAppeal(disputeId, roundId, OUTCOMES.LOW), DISPUTE_MANAGER_ERRORS.ROUND_DOES_NOT_EXIST)
        })
      })
    })

    context('when the given dispute does not exist', () => {
      const disputeId = 1000

      it('reverts', async () => {
        await assertRevert(disputeManager.confirmAppeal(disputeId, 0, OUTCOMES.LOW), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
      })
    })
  })
})
