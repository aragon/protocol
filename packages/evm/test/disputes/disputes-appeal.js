const { ZERO_ADDRESS, bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { DISPUTE_MANAGER_ERRORS } = require('../helpers/utils/errors')
const { DISPUTE_MANAGER_EVENTS } = require('../helpers/utils/events')
const { getVoteId, oppositeOutcome, outcomeFor, OUTCOMES } = require('../helpers/utils/crvoting')
const { buildHelper, ROUND_STATES, DISPUTE_STATES, DEFAULTS } = require('../helpers/wrappers/protocol')

contract('DisputeManager', ([_, drafter, appealMaker, appealTaker, guardian500, guardian1000, guardian1500, guardian2000, guardian2500, guardian3000, guardian3500, guardian4000]) => {
  let protocolHelper, disputeManager, voting

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
    await protocolHelper.deploy()
    voting = protocolHelper.voting
    disputeManager = protocolHelper.disputeManager
    await protocolHelper.activate(guardians)
  })

  describe('createAppeal', () => {
    context('when the given dispute exists', () => {
      let disputeId

      beforeEach('activate guardians and create dispute', async () => {
        disputeId = await protocolHelper.dispute()
      })

      context('when the given round is valid', () => {
        let voteId, voters

        const itIsAtState = (roundId, state) => {
          it(`round is at state ${state}`, async () => {
            const { roundState } = await protocolHelper.getRound(disputeId, roundId)
            assertBn(roundState, state, 'round state does not match')
          })
        }

        const itFailsToAppeal = (roundId) => {
          it('fails to appeal', async () => {
            await assertRevert(disputeManager.createAppeal(disputeId, roundId, OUTCOMES.REFUSED), DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
          })
        }

        context('for a regular round', () => {
          let draftedGuardians
          const roundId = 0

          beforeEach('draft round', async () => {
            draftedGuardians = await protocolHelper.draft({ disputeId, drafter })
          })

          beforeEach('define a group of voters', async () => {
            voteId = getVoteId(disputeId, roundId)
            // pick the first 3 drafted guardians to vote
            voters = draftedGuardians.slice(0, 3)
            voters.forEach((voter, i) => voter.outcome = outcomeFor(i))
          })

          context('during commit period', () => {
            itIsAtState(roundId, ROUND_STATES.COMMITTING)
            itFailsToAppeal(roundId)
          })

          context('during reveal period', () => {
            beforeEach('commit votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.REVEALING)
            itFailsToAppeal(roundId)
          })

          context('during appeal period', () => {
            let winningRuling

            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })

              winningRuling = await voting.getWinningOutcome(voteId)
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)

            context('when the appeal ruling is valid', () => {
              let appealMakerRuling

              context('when the appeal ruling is different from the winning one', () => {
                beforeEach('set confirmed ruling', async () => {
                  appealMakerRuling = oppositeOutcome(winningRuling)
                })

                context('when the appeal maker has enough balance', () => {
                  beforeEach('mint fee tokens for appeal maker', async () => {
                    const { appealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)
                    await protocolHelper.mintAndApproveFeeTokens(appealMaker, disputeManager.address, appealDeposit)
                  })

                  it('emits an event', async () => {
                    const receipt = await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.RULING_APPEALED)
                    assertEvent(receipt, DISPUTE_MANAGER_EVENTS.RULING_APPEALED, { expectedArgs: { disputeId, roundId, ruling: appealMakerRuling } })
                  })

                  it('appeals the given round', async () => {
                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    const { appealer, appealedRuling, taker, opposedRuling } = await protocolHelper.getAppeal(disputeId, roundId)
                    assert.equal(appealer, appealMaker, 'appeal maker does not match')
                    assertBn(appealedRuling, appealMakerRuling, 'appealed ruling does not match')
                    assertBn(taker, ZERO_ADDRESS, 'appeal taker does not match')
                    assertBn(opposedRuling, 0, 'opposed ruling does not match')
                  })

                  it('transfers the appeal deposit to the dispute manager', async () => {
                    const { treasury, feeToken } = protocolHelper
                    const { appealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)

                    const previousDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
                    const previousTreasuryBalance = await feeToken.balanceOf(treasury.address)
                    const previousAppealerBalance = await feeToken.balanceOf(appealMaker)

                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    const currentDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
                    assertBn(previousDisputeManagerBalance, currentDisputeManagerBalance, 'dispute manager balances do not match')

                    const currentTreasuryBalance = await feeToken.balanceOf(treasury.address)
                    assertBn(previousTreasuryBalance.add(appealDeposit), currentTreasuryBalance, 'treasury balances do not match')

                    const currentAppealerBalance = await feeToken.balanceOf(appealMaker)
                    assertBn(previousAppealerBalance.sub(appealDeposit), currentAppealerBalance, 'sender balances do not match')
                  })

                  it('does not create a new round for the dispute', async () => {
                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    await assertRevert(disputeManager.getRound(disputeId, roundId + 1), DISPUTE_MANAGER_ERRORS.ROUND_DOES_NOT_EXIST)
                  })

                  it('does not modify the current round of the dispute', async () => {
                    const { draftTerm: previousDraftTerm } = await protocolHelper.getRound(disputeId, roundId)

                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    const { draftTerm, delayedTerms, roundGuardiansNumber, selectedGuardians, guardianFees, settledPenalties, collectedTokens } = await protocolHelper.getRound(disputeId, roundId)
                    assertBn(draftTerm, previousDraftTerm, 'current round draft term does not match')
                    assertBn(delayedTerms, 0, 'current round delay term does not match')
                    assertBn(roundGuardiansNumber, DEFAULTS.firstRoundGuardiansNumber, 'current round guardians number does not match')
                    assertBn(selectedGuardians, DEFAULTS.firstRoundGuardiansNumber, 'current round selected guardians number does not match')
                    assertBn(guardianFees, protocolHelper.guardianFee.mul(bn(DEFAULTS.firstRoundGuardiansNumber)), 'current round guardian fees do not match')
                    assert.equal(settledPenalties, false, 'current round penalties should not be settled')
                    assertBn(collectedTokens, 0, 'current round collected tokens should be zero')
                  })

                  it('does not modify core dispute information', async () => {
                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    const { possibleRulings, state, finalRuling } = await protocolHelper.getDispute(disputeId)
                    assertBn(state, DISPUTE_STATES.ADJUDICATING, 'dispute state does not match')
                    assertBn(possibleRulings, 2, 'dispute possible rulings do not match')
                    assertBn(finalRuling, 0, 'dispute final ruling does not match')
                  })

                  it('cannot be appealed twice', async () => {
                    await disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker })

                    await assertRevert(disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker }), DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
                  })
                })

                context('when the appeal maker does not have enough balance', () => {
                  it('reverts', async () => {
                    await assertRevert(disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker }), DISPUTE_MANAGER_ERRORS.DEPOSIT_FAILED)
                  })
                })
              })

              context('when the appeal ruling is equal to the winning one', () => {
                beforeEach('set confirmed ruling', async () => {
                  appealMakerRuling = winningRuling
                })

                it('reverts', async () => {
                  await assertRevert(disputeManager.createAppeal(disputeId, roundId, appealMakerRuling, { from: appealMaker }), DISPUTE_MANAGER_ERRORS.INVALID_APPEAL_RULING)
                })
              })
            })

            context('when the appeal ruling is not valid', () => {
              const invalidRuling = 10

              it('reverts', async () => {
                await assertRevert(disputeManager.createAppeal(disputeId, roundId, invalidRuling, { from: appealMaker }), DISPUTE_MANAGER_ERRORS.INVALID_APPEAL_RULING)
              })
            })
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
              itFailsToAppeal(roundId)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker })
              })

              itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
              itFailsToAppeal(roundId)
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
              itFailsToAppeal(roundId)
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
                itFailsToAppeal(roundId)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await protocolHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToAppeal(roundId)
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
            voteId = getVoteId(disputeId, roundId)
            voters = [
              { address: guardian1000, outcome: OUTCOMES.LOW },
              { address: guardian4000, outcome: OUTCOMES.LOW },
              { address: guardian2000, outcome: OUTCOMES.HIGH },
              { address: guardian1500, outcome: OUTCOMES.REFUSED }
            ]
          })

          context('during commit period', () => {
            itIsAtState(roundId, ROUND_STATES.COMMITTING)
            itFailsToAppeal(roundId)
          })

          context('during reveal period', () => {
            beforeEach('commit votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.REVEALING)
            itFailsToAppeal(roundId)
          })

          context('during appeal period', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToAppeal(roundId)
          })

          context('during the appeal confirmation period', () => {
            beforeEach('commit and reveal votes, and pass appeal period', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
              await protocolHelper.passTerms(protocolHelper.appealTerms)
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToAppeal(roundId)
          })

          context('after the appeal confirmation period', () => {
            beforeEach('commit and reveal votes, and pass appeal and confirmation periods', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
              await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToAppeal(roundId)
          })
        })
      })

      context('when the given round is not valid', () => {
        const roundId = 5

        it('reverts', async () => {
          await assertRevert(disputeManager.createAppeal(disputeId, roundId, OUTCOMES.LOW), DISPUTE_MANAGER_ERRORS.ROUND_DOES_NOT_EXIST)
        })
      })
    })

    context('when the given dispute does not exist', () => {
      const disputeId = 1000

      it('reverts', async () => {
        await assertRevert(disputeManager.createAppeal(disputeId, 0, OUTCOMES.LOW), DISPUTE_MANAGER_ERRORS.DISPUTE_DOES_NOT_EXIST)
      })
    })
  })
})
