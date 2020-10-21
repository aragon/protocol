const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { filterWinningGuardians } = require('../helpers/utils/guardians')
const { DISPUTE_MANAGER_ERRORS } = require('../helpers/utils/errors')
const { DISPUTE_MANAGER_EVENTS } = require('../helpers/utils/events')
const { buildHelper, ROUND_STATES, DEFAULTS } = require('../helpers/wrappers/protocol')
const { getVoteId, oppositeOutcome, OUTCOMES } = require('../helpers/utils/crvoting')

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

  before('create protocol and activate guardians', async () => {
    protocolHelper = buildHelper()
    await protocolHelper.deploy()
    voting = protocolHelper.voting
    disputeManager = protocolHelper.disputeManager
    await protocolHelper.activate(guardians)
  })

  describe('settle', () => {
    context('when the given dispute exists', () => {
      let disputeId, voteId

      beforeEach('create dispute', async () => {
        disputeId = await protocolHelper.dispute()
      })

      context('when the given round is valid', () => {
        const roundId = 0
        const voters = [
          { address: guardian1000, weight: 1, outcome: OUTCOMES.LEAKED },
          { address: guardian2000, weight: 1, outcome: OUTCOMES.HIGH },
          { address: guardian4000, weight: 1, outcome: OUTCOMES.LOW }
        ]

        const itIsAtState = (roundId, state) => {
          it(`round is at state ${state}`, async () => {
            const { roundState } = await protocolHelper.getRound(disputeId, roundId)
            assertBn(roundState, state, 'round state does not match')
          })
        }

        const itFailsToSettleAppealDeposits = (roundId) => {
          it('fails to settle appeal deposits', async () => {
            await assertRevert(disputeManager.settleAppealDeposit(disputeId, roundId), DISPUTE_MANAGER_ERRORS.ROUND_PENALTIES_NOT_SETTLED)
          })
        }

        const itCannotSettleAppealDeposits = (roundId) => {
          describe('settleAppealDeposit', () => {
            context('when penalties have been settled', () => {
              beforeEach('settle penalties', async () => {
                await disputeManager.settlePenalties(disputeId, roundId, 0)
              })

              it('reverts', async () => {
                await assertRevert(disputeManager.settleAppealDeposit(disputeId, roundId), DISPUTE_MANAGER_ERRORS.ROUND_NOT_APPEALED)
              })
            })

            context('when penalties have not been settled yet', () => {
              it('reverts', async () => {
                await assertRevert(disputeManager.settleAppealDeposit(disputeId, roundId), DISPUTE_MANAGER_ERRORS.ROUND_PENALTIES_NOT_SETTLED)
              })
            })
          })
        }

        beforeEach('mock draft round', async () => {
          voteId = getVoteId(disputeId, roundId)
          await protocolHelper.draft({ disputeId, drafter, draftedGuardians: voters })
        })

        context('during commit period', () => {
          itIsAtState(roundId, ROUND_STATES.COMMITTING)
          itFailsToSettleAppealDeposits(roundId)
        })

        context('during reveal period', () => {
          beforeEach('commit votes', async () => {
            await protocolHelper.commit({ disputeId, roundId, voters })
          })

          itIsAtState(roundId, ROUND_STATES.REVEALING)
          itFailsToSettleAppealDeposits(roundId)
        })

        context('during appeal period', () => {
          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await protocolHelper.passTerms(protocolHelper.commitTerms.add(protocolHelper.revealTerms))
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)
            itFailsToSettleAppealDeposits(roundId)
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)
            itFailsToSettleAppealDeposits(roundId)
          })
        })

        context('during the appeal confirmation period', () => {
          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await protocolHelper.passTerms(protocolHelper.commitTerms.add(protocolHelper.revealTerms))
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal period', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms)
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itCannotSettleAppealDeposits(roundId)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker, ruling: OUTCOMES.LOW })
              })

              itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
              itFailsToSettleAppealDeposits(roundId)
            })
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal period', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms)
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itCannotSettleAppealDeposits(roundId)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker })
              })

              itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
              itFailsToSettleAppealDeposits(roundId)
            })
          })
        })

        context('after the appeal confirmation period', () => {
          const itSettlesAppealDeposits = (roundId, itTransferAppealsDeposits) => {
            describe('settleAppealDeposit', () => {
              context('when penalties have been settled', () => {
                beforeEach('settle penalties', async () => {
                  await disputeManager.settlePenalties(disputeId, roundId, 0)
                })

                itTransferAppealsDeposits()

                it('emits an event', async () => {
                  const receipt = await disputeManager.settleAppealDeposit(disputeId, roundId)

                  assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.APPEAL_DEPOSIT_SETTLED)
                  assertEvent(receipt, DISPUTE_MANAGER_EVENTS.APPEAL_DEPOSIT_SETTLED, { expectedArgs: { disputeId, roundId } })
                })

                it('does not affect the balances of the dispute manager', async () => {
                  const { treasury, feeToken } = protocolHelper
                  const previousDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
                  const previousTreasuryBalance = await feeToken.balanceOf(treasury.address)

                  await disputeManager.settleAppealDeposit(disputeId, roundId)

                  const currentDisputeManagerBalance = await feeToken.balanceOf(disputeManager.address)
                  assertBn(previousDisputeManagerBalance, currentDisputeManagerBalance, 'dispute manager balances do not match')

                  const currentTreasuryBalance = await feeToken.balanceOf(treasury.address)
                  assertBn(previousTreasuryBalance, currentTreasuryBalance, 'treasury balances do not match')
                })

                it('cannot be settled twice', async () => {
                  await disputeManager.settleAppealDeposit(disputeId, roundId)

                  await assertRevert(disputeManager.settleAppealDeposit(disputeId, roundId), DISPUTE_MANAGER_ERRORS.APPEAL_ALREADY_SETTLED)
                })
              })

              context('when penalties have not been settled yet', () => {
                it('reverts', async () => {
                  await assertRevert(disputeManager.settleAppealDeposit(disputeId, roundId), DISPUTE_MANAGER_ERRORS.ROUND_PENALTIES_NOT_SETTLED)
                })
              })
            })
          }

          const itReturnsAppealDepositsToMaker = (roundId) => {
            itSettlesAppealDeposits(roundId, () => {
              it('returns the deposit to the appeal maker', async () => {
                const { treasury, feeToken } = protocolHelper
                const { appealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)

                const previousBalance = await treasury.balanceOf(feeToken.address, appealMaker)

                await disputeManager.settleAppealDeposit(disputeId, roundId)

                const currentBalance = await treasury.balanceOf(feeToken.address, appealMaker)
                assertBn(previousBalance.add(appealDeposit), currentBalance, 'appeal maker balances do not match')
              })
            })
          }

          const itSettlesAppealDepositsToMaker = (roundId) => {
            itSettlesAppealDeposits(roundId, () => {
              it('settles the total deposit to the appeal taker', async () => {
                const { treasury, feeToken } = protocolHelper
                const { appealFees, appealDeposit, confirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)

                const expectedAppealReward = appealDeposit.add(confirmAppealDeposit).sub(appealFees)
                const previousAppealTakerBalance = await treasury.balanceOf(feeToken.address, appealTaker)

                await disputeManager.settleAppealDeposit(disputeId, roundId)

                const currentAppealTakerBalance = await treasury.balanceOf(feeToken.address, appealTaker)
                assertBn(currentAppealTakerBalance, previousAppealTakerBalance.add(expectedAppealReward), 'appeal maker balances do not match')
              })
            })
          }

          const itSettlesAppealDepositsToTaker = (roundId) => {
            itSettlesAppealDeposits(roundId, () => {
              it('settles the total deposit to the appeal maker', async () => {
                const { treasury, feeToken } = protocolHelper
                const { appealFees, appealDeposit, confirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)

                const expectedAppealReward = appealDeposit.add(confirmAppealDeposit).sub(appealFees)
                const previousAppealMakerBalance = await treasury.balanceOf(feeToken.address, appealMaker)

                await disputeManager.settleAppealDeposit(disputeId, roundId)

                const currentAppealMakerBalance = await treasury.balanceOf(feeToken.address, appealMaker)
                assertBn(currentAppealMakerBalance, previousAppealMakerBalance.add(expectedAppealReward), 'appeal maker balances do not match')
              })
            })
          }

          const itReturnsAppealDepositsToBoth = (roundId) => {
            itSettlesAppealDeposits(roundId, () => {
              it('splits the appeal deposit', async () => {
                const { treasury, feeToken } = protocolHelper
                const { appealFees, appealDeposit, confirmAppealDeposit } = await protocolHelper.getAppealFees(disputeId, roundId)

                const expectedAppealMakerReward = appealDeposit.sub(appealFees.div(bn(2)))
                const previousAppealMakerBalance = await treasury.balanceOf(feeToken.address, appealMaker)

                const expectedAppealTakerReward = confirmAppealDeposit.sub(appealFees.div(bn(2)))
                const previousAppealTakerBalance = await treasury.balanceOf(feeToken.address, appealTaker)

                await disputeManager.settleAppealDeposit(disputeId, roundId)

                const currentAppealMakerBalance = await treasury.balanceOf(feeToken.address, appealMaker)
                assertBn(currentAppealMakerBalance, previousAppealMakerBalance.add(expectedAppealMakerReward), 'appeal maker balances do not match')

                const currentAppealTakerBalance = await treasury.balanceOf(feeToken.address, appealTaker)
                assertBn(currentAppealTakerBalance, previousAppealTakerBalance.add(expectedAppealTakerReward), 'appeal taker balances do not match')
              })
            })
          }

          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await protocolHelper.passTerms(protocolHelper.commitTerms.add(protocolHelper.revealTerms))
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal and confirmation periods', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itCannotSettleAppealDeposits(roundId)
            })

            context('when the round was appealed', () => {
              const appealedRuling = OUTCOMES.HIGH

              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker, ruling: appealedRuling })
              })

              context('when the appeal was not confirmed', () => {
                beforeEach('pass confirmation period', async () => {
                  await protocolHelper.passTerms(protocolHelper.appealConfirmTerms)
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itReturnsAppealDepositsToMaker(roundId)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await protocolHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToSettleAppealDeposits(roundId)
              })
            })
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await protocolHelper.commit({ disputeId, roundId, voters })
              await protocolHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              beforeEach('pass appeal and confirmation periods', async () => {
                await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itCannotSettleAppealDeposits(roundId)
            })

            context('when the round was appealed', () => {
              const appealedRuling = OUTCOMES.HIGH

              beforeEach('appeal', async () => {
                await protocolHelper.appeal({ disputeId, roundId, appealMaker, ruling: appealedRuling })
              })

              context('when the appeal was not confirmed', () => {
                beforeEach('pass confirmation period', async () => {
                  await protocolHelper.passTerms(protocolHelper.appealConfirmTerms)
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itReturnsAppealDepositsToMaker(roundId)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await protocolHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToSettleAppealDeposits(roundId)

                context('when the next round is a regular round', () => {
                  const newRoundId = roundId + 1

                  const draftAndVoteSecondRound = newRoundVoters => {
                    beforeEach('draft and vote second round', async () => {
                      const expectedNewRoundGuardiansNumber = 9 // previous guardians * 3 + 1
                      const { roundGuardiansNumber } = await protocolHelper.getRound(disputeId, newRoundId)
                      assertBn(roundGuardiansNumber, expectedNewRoundGuardiansNumber, 'new round guardians number does not match')

                      await protocolHelper.draft({ disputeId, maxGuardiansToBeDrafted: expectedNewRoundGuardiansNumber, draftedGuardians: newRoundVoters })
                      await protocolHelper.commit({ disputeId, roundId: newRoundId, voters: newRoundVoters })
                      await protocolHelper.reveal({ disputeId, roundId: newRoundId, voters: newRoundVoters })
                      await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
                    })
                  }

                  context('when the ruling is sustained', async () => {
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.LOW },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.LOW },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.LOW }
                    ]

                    draftAndVoteSecondRound(newRoundVoters)
                    itSettlesAppealDepositsToMaker(roundId)
                  })

                  context('when the ruling is flipped', async () => {
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.HIGH },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.HIGH },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.HIGH }
                    ]

                    draftAndVoteSecondRound(newRoundVoters)
                    itSettlesAppealDepositsToTaker(roundId)
                  })

                  context('when the ruling is refused', async () => {
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.REFUSED },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.REFUSED },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.REFUSED },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.REFUSED },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.REFUSED }
                    ]

                    draftAndVoteSecondRound(newRoundVoters)
                    itReturnsAppealDepositsToBoth(roundId)
                  })

                  context('when no one voted', async () => {
                    const newRoundDraftedGuardians = [
                      { address: guardian500,  weight: 1 },
                      { address: guardian2000, weight: 4 },
                      { address: guardian2500, weight: 1 },
                      { address: guardian4000, weight: 2 },
                      { address: guardian3000, weight: 1 }
                    ]

                    beforeEach('pass second round', async () => {
                      await protocolHelper.draft({ disputeId, maxGuardiansToBeDrafted: 0, draftedGuardians: newRoundDraftedGuardians })
                      await protocolHelper.passTerms(protocolHelper.commitTerms.add(protocolHelper.revealTerms).add(protocolHelper.appealTerms).add(protocolHelper.appealConfirmTerms))
                    })

                    itReturnsAppealDepositsToBoth(roundId)
                  })
                })

                context('when the next round is a final round', () => {
                  const finalRoundId = DEFAULTS.maxRegularAppealRounds.toNumber()

                  const itHandlesRoundsSettlesProperly = (finalRoundVoters, expectedFinalRuling) => {
                    const previousRoundsVoters = { [roundId]: voters }

                    beforeEach('move to final round', async () => {
                      // appeal until we reach the final round, always flipping the previous round winning ruling
                      let previousWinningRuling = await voting.getWinningOutcome(voteId)
                      for (let nextRoundId = roundId + 1; nextRoundId < finalRoundId; nextRoundId++) {
                        const roundWinningRuling = oppositeOutcome(previousWinningRuling)
                        const roundVoters = await protocolHelper.draft({ disputeId })
                        roundVoters.forEach(voter => voter.outcome = roundWinningRuling)
                        previousRoundsVoters[nextRoundId] = roundVoters

                        await protocolHelper.commit({ disputeId, roundId: nextRoundId, voters: roundVoters })
                        await protocolHelper.reveal({ disputeId, roundId: nextRoundId, voters: roundVoters })
                        await protocolHelper.appeal({ disputeId, roundId: nextRoundId, appealMaker, ruling: previousWinningRuling })
                        await protocolHelper.confirmAppeal({ disputeId, roundId: nextRoundId, appealTaker, ruling: roundWinningRuling })
                        previousWinningRuling = roundWinningRuling
                      }
                    })

                    beforeEach('end final round', async () => {
                      // commit and reveal votes, and pass appeal and confirmation periods to end dispute
                      await protocolHelper.commit({ disputeId, roundId: finalRoundId, voters: finalRoundVoters })
                      await protocolHelper.reveal({ disputeId, roundId: finalRoundId, voters: finalRoundVoters })
                      await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
                    })

                    beforeEach('settle previous rounds', async () => {
                      for (let nextRoundId = 0; nextRoundId < finalRoundId; nextRoundId++) {
                        await disputeManager.settlePenalties(disputeId, nextRoundId, 0)
                        const [winners] = filterWinningGuardians(previousRoundsVoters[nextRoundId], expectedFinalRuling)
                        for (const { address } of winners) {
                          await disputeManager.settleReward(disputeId, nextRoundId, address)
                        }
                      }
                    })

                    itCannotSettleAppealDeposits(finalRoundId)
                  }

                  context('when the ruling is sustained', async () => {
                    const expectedFinalRuling = OUTCOMES.LOW
                    const finalRoundVoters = [
                      { address: guardian500,  outcome: OUTCOMES.HIGH },
                      { address: guardian2000, outcome: OUTCOMES.LOW },
                      { address: guardian2500, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, outcome: OUTCOMES.LOW },
                      { address: guardian3000, outcome: OUTCOMES.LOW }
                    ]

                    itHandlesRoundsSettlesProperly(finalRoundVoters, expectedFinalRuling)
                  })

                  context('when the ruling is flipped', async () => {
                    const expectedFinalRuling = appealedRuling
                    const finalRoundVoters = [
                      { address: guardian500,  outcome: OUTCOMES.HIGH },
                      { address: guardian2000, outcome: OUTCOMES.HIGH },
                      { address: guardian2500, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, outcome: OUTCOMES.HIGH },
                      { address: guardian3000, outcome: OUTCOMES.HIGH }
                    ]

                    itHandlesRoundsSettlesProperly(finalRoundVoters, expectedFinalRuling)
                  })

                  context('when the ruling is refused', async () => {
                    const expectedFinalRuling = OUTCOMES.REFUSED
                    const finalRoundVoters = [
                      { address: guardian500,  outcome: OUTCOMES.REFUSED },
                      { address: guardian2000, outcome: OUTCOMES.REFUSED },
                      { address: guardian2500, outcome: OUTCOMES.REFUSED },
                      { address: guardian4000, outcome: OUTCOMES.REFUSED },
                      { address: guardian3000, outcome: OUTCOMES.REFUSED }
                    ]

                    itHandlesRoundsSettlesProperly(finalRoundVoters, expectedFinalRuling)
                  })
                })
              })
            })
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
