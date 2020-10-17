const { bn, bigExp, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { getVoteId, oppositeOutcome, OUTCOMES } = require('../helpers/utils/crvoting')
const { DISPUTE_MANAGER_ERRORS, REGISTRY_ERRORS } = require('../helpers/utils/errors')
const { filterGuardians, filterWinningGuardians, ACTIVATE_DATA } = require('../helpers/utils/guardians')
const { buildHelper, ROUND_STATES, DISPUTE_STATES, DEFAULTS } = require('../helpers/wrappers/court')
const { ARBITRABLE_EVENTS, DISPUTE_MANAGER_EVENTS, REGISTRY_EVENTS } = require('../helpers/utils/events')

const DisputeManager = artifacts.require('DisputeManager')
const Arbitrable = artifacts.require('ArbitrableMock')

contract('DisputeManager', ([_, drafter, appealMaker, appealTaker, guardian500, guardian1000, guardian1500, guardian2000, guardian2500, guardian3000, guardian3500, guardian4000, anyone]) => {
  let courtHelper, court, disputeManager, voting
  const maxRegularAppealRounds = bn(2)

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

  const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD'

  before('create court and activate guardians', async () => {
    courtHelper = buildHelper()
    court = await courtHelper.deploy({ maxRegularAppealRounds })
    voting = courtHelper.voting
    disputeManager = courtHelper.disputeManager
    await courtHelper.activate(guardians)
  })

  describe('settle round', () => {
    context('when the given dispute exists', () => {
      let disputeId, voteId

      beforeEach('activate guardians and create dispute', async () => {
        disputeId = await courtHelper.dispute()
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
            const { roundState } = await courtHelper.getRound(disputeId, roundId)
            assertBn(roundState, state, 'round state does not match')
          })
        }

        const itFailsToRuleAndSettleRound = (roundId) => {
          it('fails to compute ruling and settle round', async () => {
            await assertRevert(disputeManager.computeRuling(disputeId), DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
            await assertRevert(disputeManager.settlePenalties(disputeId, roundId, DEFAULTS.firstRoundGuardiansNumber), DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
            await assertRevert(disputeManager.settleReward(disputeId, roundId, anyone), DISPUTE_MANAGER_ERRORS.ROUND_PENALTIES_NOT_SETTLED)
          })
        }

        const itExecutesFinalRulingProperly = expectedFinalRuling => {
          describe('rule', () => {
            it('marks the dispute ruling as computed but not twice', async () => {
              const receipt = await court.rule(disputeId)

              const logs = decodeEvents(receipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.RULING_COMPUTED)
              assertAmountOfEvents({ logs }, DISPUTE_MANAGER_EVENTS.RULING_COMPUTED)
              assertEvent({ logs }, DISPUTE_MANAGER_EVENTS.RULING_COMPUTED, { expectedArgs: { disputeId, ruling: expectedFinalRuling } })

              const { possibleRulings, state, finalRuling } = await courtHelper.getDispute(disputeId)
              assertBn(state, DISPUTE_STATES.RULED, 'dispute state does not match')
              assertBn(possibleRulings, 2, 'dispute possible rulings do not match')
              assertBn(finalRuling, expectedFinalRuling, 'dispute final ruling does not match')

              const anotherReceipt = await court.rule(disputeId)
              const anotherLogs = decodeEvents(anotherReceipt, DisputeManager.abi, DISPUTE_MANAGER_EVENTS.RULING_COMPUTED)
              assertAmountOfEvents({ logs: anotherLogs }, DISPUTE_MANAGER_EVENTS.RULING_COMPUTED, { expectedAmount: 0 })
            })

            it('executes the final ruling on the arbitrable', async () => {
              const { subject } = await courtHelper.getDispute(disputeId)
              const arbitrable = await Arbitrable.at(subject)

              const receipt = await arbitrable.rule(disputeId)

              const logs = decodeEvents(receipt, Arbitrable.abi, ARBITRABLE_EVENTS.RULED)
              assertAmountOfEvents({ logs }, ARBITRABLE_EVENTS.RULED)
              assertEvent({ logs }, ARBITRABLE_EVENTS.RULED, { expectedArgs: { arbitrator: court.address, disputeId, ruling: expectedFinalRuling } })
            })
          })
        }

        const itSettlesPenaltiesAndRewardsProperly = (roundId, expectedWinningGuardians, expectedLosingGuardians) => {
          let arbitrable, previousBalances = {}, expectedCoherentGuardians, expectedCollectedTokens

          beforeEach('load previous balances', async () => {
            previousBalances = {}
            for (const { address } of guardians) {
              const { active, available, locked } = await courtHelper.guardiansRegistry.balanceOf(address)
              previousBalances[address] = { active, available, locked }
            }

            const { active, available, locked } = await courtHelper.guardiansRegistry.balanceOf(BURN_ADDRESS)
            previousBalances[BURN_ADDRESS] = { active, available, locked }

            const { feeToken, treasury } = courtHelper
            arbitrable = (await courtHelper.getDispute(disputeId)).subject
            previousBalances[arbitrable] = { feeAmount: await treasury.balanceOf(feeToken.address, arbitrable) }
            previousBalances[appealMaker] = { feeAmount: await treasury.balanceOf(feeToken.address, appealMaker) }
            previousBalances[appealTaker] = { feeAmount: await treasury.balanceOf(feeToken.address, appealTaker) }
          })

          beforeEach('load expected coherent guardians', async () => {
            // for final rounds compute voter's weight
            if (roundId >= courtHelper.maxRegularAppealRounds.toNumber()) {
              for (const guardian of expectedWinningGuardians) {
                guardian.weight = (await courtHelper.getFinalRoundWeight(disputeId, roundId, guardian.address)).toNumber()
              }
            }
            expectedCoherentGuardians = expectedWinningGuardians.reduce((total, { weight }) => total + weight, 0)
          })

          beforeEach('load expected collected tokens', async () => {
            expectedCollectedTokens = bn(0)
            for (const { address } of expectedLosingGuardians) {
              const roundLockedBalance = await courtHelper.getRoundLockBalance(disputeId, roundId, address)
              expectedCollectedTokens = expectedCollectedTokens.add(roundLockedBalance)
            }

            // for final rounds add winning guardians locked amounts since all voter's tokens are collected before hand
            if (roundId >= courtHelper.maxRegularAppealRounds.toNumber()) {
              for (const { address } of expectedWinningGuardians) {
                const roundLockedBalance = await courtHelper.getRoundLockBalance(disputeId, roundId, address)
                expectedCollectedTokens = expectedCollectedTokens.add(roundLockedBalance)
              }
            }
          })

          describe('settlePenalties', () => {
            let receipt

            const itSettlesPenaltiesProperly = () => {
              it('unlocks the locked balances of the winning guardians and slashes the losing ones', async () => {
                for (const { address } of expectedWinningGuardians) {
                  const roundLockedBalance = await courtHelper.getRoundLockBalance(disputeId, roundId, address)

                  const { locked: previousLockedBalance, active: previousActiveBalance } = previousBalances[address]
                  const { active: currentActiveBalance, locked: currentLockedBalance } = await courtHelper.guardiansRegistry.balanceOf(address)
                  assertBn(currentActiveBalance, previousActiveBalance, 'current active balance does not match')

                  // for the final round tokens are slashed before hand, thus they are not considered as locked tokens
                  const expectedLockedBalance = roundId < courtHelper.maxRegularAppealRounds ? previousLockedBalance.sub(roundLockedBalance) : previousLockedBalance
                  assertBn(currentLockedBalance, expectedLockedBalance, 'current locked balance does not match')
                }

                for (const { address } of expectedLosingGuardians) {
                  const roundLockedBalance = await courtHelper.getRoundLockBalance(disputeId, roundId, address)

                  const { locked: previousLockedBalance, active: previousActiveBalance } = previousBalances[address]
                  const { active: currentActiveBalance, locked: currentLockedBalance } = await courtHelper.guardiansRegistry.balanceOf(address)

                  // for the final round tokens are slashed before hand, thus the active tokens for slashed guardians stays equal
                  const expectedActiveBalance = roundId < courtHelper.maxRegularAppealRounds
                    ? previousActiveBalance.sub(roundLockedBalance)
                    : previousActiveBalance
                  assertBn(currentActiveBalance, expectedActiveBalance, 'current active balance does not match')

                  // for the final round tokens are slashed before hand, thus they are not considered as locked tokens
                  const expectedLockedBalance = roundId < courtHelper.maxRegularAppealRounds ? previousLockedBalance.sub(roundLockedBalance) : previousLockedBalance
                  assertBn(currentLockedBalance, expectedLockedBalance, 'current locked balance does not match')
                }
              })

              it('burns the collected tokens if necessary', async () => {
                const { available: previousAvailableBalance } = previousBalances[BURN_ADDRESS]
                const { available: currentAvailableBalance } = await courtHelper.guardiansRegistry.balanceOf(BURN_ADDRESS)

                if (expectedCoherentGuardians === 0) {
                  assertBn(currentAvailableBalance, previousAvailableBalance.add(expectedCollectedTokens), 'burned balance does not match')
                } else {
                  assertBn(currentAvailableBalance, previousAvailableBalance, 'burned balance does not match')
                }
              })

              it('refunds the guardians fees if necessary', async () => {
                const { guardianFees } = await courtHelper.getRound(disputeId, roundId)
                const { feeToken, treasury } = courtHelper

                if (roundId === 0) {
                  const { feeAmount: previousArbitrableBalance } = previousBalances[arbitrable]
                  const currentArbitrableBalance = await treasury.balanceOf(feeToken.address, arbitrable)

                  expectedCoherentGuardians === 0
                    ? assertBn(currentArbitrableBalance, previousArbitrableBalance.add(guardianFees), 'arbitrable fee balance does not match')
                    : assertBn(currentArbitrableBalance, previousArbitrableBalance, 'arbitrable fee balance does not match')
                } else {
                  const { feeAmount: previousAppealMakerBalance } = previousBalances[appealMaker]
                  const currentAppealMakerBalance = await treasury.balanceOf(feeToken.address, appealMaker)

                  const { feeAmount: previousAppealTakerBalance } = previousBalances[appealTaker]
                  const currentAppealTakerBalance = await treasury.balanceOf(feeToken.address, appealTaker)

                  if (expectedCoherentGuardians === 0) {
                    const refundFees = guardianFees.div(bn(2))
                    assertBn(currentAppealMakerBalance, previousAppealMakerBalance.add(refundFees), 'appeal maker fee balance does not match')
                    assertBn(currentAppealTakerBalance, previousAppealTakerBalance.add(refundFees), 'appeal taker fee balance does not match')
                  } else {
                    assertBn(currentAppealMakerBalance, previousAppealMakerBalance, 'appeal maker fee balance does not match')
                    assertBn(currentAppealTakerBalance, previousAppealTakerBalance, 'appeal taker fee balance does not match')
                  }
                }
              })

              it('updates the given round and cannot be settled twice', async () => {
                assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.PENALTIES_SETTLED)
                assertEvent(receipt, DISPUTE_MANAGER_EVENTS.PENALTIES_SETTLED, { expectedArgs: { disputeId, roundId, collectedTokens: expectedCollectedTokens } })

                const { settledPenalties, collectedTokens, coherentGuardians } = await courtHelper.getRound(disputeId, roundId)
                assert.equal(settledPenalties, true, 'current round penalties should be settled')
                assertBn(collectedTokens, expectedCollectedTokens, 'current round collected tokens does not match')
                assertBn(coherentGuardians, expectedCoherentGuardians, 'current round coherent guardians does not match')

                await assertRevert(disputeManager.settlePenalties(disputeId, roundId, 0), DISPUTE_MANAGER_ERRORS.ROUND_ALREADY_SETTLED)
              })
            }

            context('when settling in one batch', () => {
              beforeEach('settle penalties', async () => {
                receipt = await disputeManager.settlePenalties(disputeId, roundId, 0)
              })

              itSettlesPenaltiesProperly()
            })

            context('when settling in multiple batches', () => {
              if (roundId < DEFAULTS.maxRegularAppealRounds.toNumber()) {
                beforeEach('settle penalties', async () => {
                  const batches = expectedWinningGuardians.length + expectedLosingGuardians.length
                  for (let batch = 0; batch < batches; batch++) {
                    receipt = await disputeManager.settlePenalties(disputeId, roundId, 1)
                    // assert round is not settle in the middle batches
                    if (batch < batches - 1) assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.PENALTIES_SETTLED, { expectedAmount: 0 })
                  }
                })

                itSettlesPenaltiesProperly()
              } else {
                it('reverts', async () => {
                  await disputeManager.settlePenalties(disputeId, roundId, 1)

                  await assertRevert(disputeManager.settlePenalties(disputeId, roundId, 1), DISPUTE_MANAGER_ERRORS.ROUND_ALREADY_SETTLED)
                })
              }
            })
          })

          describe('settleReward', () => {
            context('when penalties have been settled', () => {
              beforeEach('settle penalties', async () => {
                await disputeManager.settlePenalties(disputeId, roundId, 0)
              })

              if (expectedWinningGuardians.length > 0) {
                it('emits an event for each guardian and cannot be settled twice', async () => {
                  for (const { address } of expectedWinningGuardians) {
                    const receipt = await disputeManager.settleReward(disputeId, roundId, address)

                    assertAmountOfEvents(receipt, DISPUTE_MANAGER_EVENTS.REWARD_SETTLED)
                    assertEvent(receipt, DISPUTE_MANAGER_EVENTS.REWARD_SETTLED, { expectedArgs: { disputeId, roundId, guardian: address } })

                    await assertRevert(disputeManager.settleReward(disputeId, roundId, address), DISPUTE_MANAGER_ERRORS.GUARDIAN_ALREADY_REWARDED)
                  }
                })

                it('rewards the winning guardians with guardian tokens and fees', async () => {
                  const { treasury, feeToken } = courtHelper
                  const { guardianFees } = await courtHelper.getRound(disputeId, roundId)

                  for (const { address, weight } of expectedWinningGuardians) {
                    const previousGuardianBalance = await treasury.balanceOf(feeToken.address, address)

                    await disputeManager.settleReward(disputeId, roundId, address)

                    const { weight: actualWeight, rewarded } = await courtHelper.getRoundGuardian(disputeId, roundId, address)
                    assert.isTrue(rewarded, 'guardian should have been rewarded')
                    assertBn(actualWeight, weight, 'guardian weight should not have changed')

                    const { available } = await courtHelper.guardiansRegistry.balanceOf(address)
                    const expectedANJReward = expectedCollectedTokens.mul(bn(weight)).div(bn(expectedCoherentGuardians))
                    const expectedCurrentAvailableBalance = previousBalances[address].available.add(expectedANJReward)
                    assertBn(expectedCurrentAvailableBalance, available, 'current available balance does not match')

                    const expectedFeeReward = guardianFees.mul(bn(weight)).div(bn(expectedCoherentGuardians))
                    const currentGuardianBalance = await treasury.balanceOf(feeToken.address, address)
                    assertBn(currentGuardianBalance, previousGuardianBalance.add(expectedFeeReward), 'guardian fee balance does not match')
                  }
                })

                it('does not allow settling non-winning guardians', async () => {
                  for (const { address } of expectedLosingGuardians) {
                    await assertRevert(disputeManager.settleReward(disputeId, roundId, address), DISPUTE_MANAGER_ERRORS.WONT_REWARD_INCOHERENT_GUARDIAN)
                  }
                })

                if (roundId >= maxRegularAppealRounds.toNumber()) {
                  it('locks only after final round lock period', async () => {
                    const amount = bn(1)

                    // settle reward and deactivate
                    for (const guardian of expectedWinningGuardians) {
                      await disputeManager.settleReward(disputeId, roundId, guardian.address)
                      await courtHelper.guardiansRegistry.deactivate(0, { from: guardian.address }) // deactivate all
                    }

                    // fails to withdraw on next term
                    await courtHelper.passTerms(bn(1))
                    for (const guardian of expectedWinningGuardians) {
                      await assertRevert(courtHelper.guardiansRegistry.unstake(amount, '0x0', { from: guardian.address }), REGISTRY_ERRORS.WITHDRAWALS_LOCK)
                    }

                    // fails to withdraw on last locked term
                    const { draftTerm } = await disputeManager.getRound(disputeId, roundId)
                    const lastLockedTermId = draftTerm.add(courtHelper.commitTerms).add(courtHelper.revealTerms).add(courtHelper.finalRoundLockTerms)
                    await courtHelper.setTerm(lastLockedTermId)
                    for (const guardian of expectedWinningGuardians) {
                      await assertRevert(courtHelper.guardiansRegistry.unstake(amount, '0x0', { from: guardian.address }), REGISTRY_ERRORS.WITHDRAWALS_LOCK)
                    }

                    // succeeds to withdraw after locked term
                    await courtHelper.passTerms(bn(1))
                    for (const guardian of expectedWinningGuardians) {
                      const receipt = await courtHelper.guardiansRegistry.unstake(amount, '0x0', { from: guardian.address })
                      assertAmountOfEvents(receipt, REGISTRY_EVENTS.UNSTAKED)
                      assertEvent(receipt, REGISTRY_EVENTS.UNSTAKED, { expectedArgs: { user: guardian.address, amount: amount.toString() } })
                    }
                  })
                }
              } else {
                it('does not allow settling non-winning guardians', async () => {
                  for (const { address } of expectedLosingGuardians) {
                    await assertRevert(disputeManager.settleReward(disputeId, roundId, address), DISPUTE_MANAGER_ERRORS.WONT_REWARD_INCOHERENT_GUARDIAN)
                  }
                })
              }

              it('does not allow settling non-voting guardians', async () => {
                const nonVoters = filterGuardians(guardians, expectedWinningGuardians.concat(expectedLosingGuardians))

                for (const { address } of nonVoters) {
                  await assertRevert(disputeManager.settleReward(disputeId, roundId, address), DISPUTE_MANAGER_ERRORS.WONT_REWARD_NON_VOTER_GUARDIAN)
                }
              })
            })

            context('when penalties have not been settled yet', () => {
              it('reverts', async () => {
                for (const { address } of expectedWinningGuardians) {
                  await assertRevert(disputeManager.settleReward(disputeId, roundId, address), DISPUTE_MANAGER_ERRORS.ROUND_PENALTIES_NOT_SETTLED)
                }
              })
            })
          })
        }

        beforeEach('mock draft round', async () => {
          voteId = getVoteId(disputeId, roundId)
          await courtHelper.draft({ disputeId, drafter, draftedGuardians: voters })
        })

        context('during commit period', () => {
          itIsAtState(roundId, ROUND_STATES.COMMITTING)
          itFailsToRuleAndSettleRound(roundId)
        })

        context('during reveal period', () => {
          beforeEach('commit votes', async () => {
            await courtHelper.commit({ disputeId, roundId, voters })
          })

          itIsAtState(roundId, ROUND_STATES.REVEALING)
          itFailsToRuleAndSettleRound(roundId)
        })

        context('during appeal period', () => {
          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await courtHelper.passTerms(courtHelper.commitTerms.add(courtHelper.revealTerms))
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)
            itFailsToRuleAndSettleRound(roundId)
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await courtHelper.commit({ disputeId, roundId, voters })
              await courtHelper.reveal({ disputeId, roundId, voters })
            })

            itIsAtState(roundId, ROUND_STATES.APPEALING)
            itFailsToRuleAndSettleRound(roundId)
          })
        })

        context('during the appeal confirmation period', () => {
          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await courtHelper.passTerms(courtHelper.commitTerms.add(courtHelper.revealTerms))
            })

            context('when the round was not appealed', () => {
              const expectedFinalRuling = OUTCOMES.REFUSED
              const expectedWinningGuardians = []
              const expectedLosingGuardians = voters

              beforeEach('pass appeal period', async () => {
                await courtHelper.passTerms(courtHelper.appealTerms)
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itExecutesFinalRulingProperly(expectedFinalRuling)
              itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await courtHelper.appeal({ disputeId, roundId, appealMaker, ruling: OUTCOMES.LOW })
              })

              itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
              itFailsToRuleAndSettleRound(roundId)
            })
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await courtHelper.commit({ disputeId, roundId, voters })
              await courtHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              const expectedFinalRuling = OUTCOMES.LOW
              const expectedWinningGuardians = voters.filter(({ outcome }) => outcome === expectedFinalRuling)
              const expectedLosingGuardians = filterGuardians(voters, expectedWinningGuardians)

              beforeEach('pass appeal period', async () => {
                await courtHelper.passTerms(courtHelper.appealTerms)
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itExecutesFinalRulingProperly(expectedFinalRuling)
              itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
            })

            context('when the round was appealed', () => {
              beforeEach('appeal', async () => {
                await courtHelper.appeal({ disputeId, roundId, appealMaker })
              })

              itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
              itFailsToRuleAndSettleRound(roundId)
            })
          })
        })

        context('after the appeal confirmation period', () => {
          context('when there were no votes', () => {
            beforeEach('pass commit and reveal periods', async () => {
              await courtHelper.passTerms(courtHelper.commitTerms.add(courtHelper.revealTerms))
            })

            context('when the round was not appealed', () => {
              const expectedFinalRuling = OUTCOMES.REFUSED
              const expectedWinningGuardians = []
              const expectedLosingGuardians = voters

              beforeEach('pass appeal and confirmation periods', async () => {
                await courtHelper.passTerms(courtHelper.appealTerms.add(courtHelper.appealConfirmTerms))
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itExecutesFinalRulingProperly(expectedFinalRuling)
              itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
            })

            context('when the round was appealed', () => {
              const appealedRuling = OUTCOMES.HIGH

              beforeEach('appeal', async () => {
                await courtHelper.appeal({ disputeId, roundId, appealMaker, ruling: appealedRuling })
              })

              context('when the appeal was not confirmed', () => {
                const expectedFinalRuling = appealedRuling
                const expectedWinningGuardians = []
                const expectedLosingGuardians = voters

                beforeEach('pass confirmation period', async () => {
                  await courtHelper.passTerms(courtHelper.appealConfirmTerms)
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itExecutesFinalRulingProperly(expectedFinalRuling)
                itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await courtHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToRuleAndSettleRound(roundId)
              })
            })
          })

          context('when there were some votes', () => {
            beforeEach('commit and reveal votes', async () => {
              await courtHelper.commit({ disputeId, roundId, voters })
              await courtHelper.reveal({ disputeId, roundId, voters })
            })

            context('when the round was not appealed', () => {
              const expectedFinalRuling = OUTCOMES.LOW
              const expectedWinningGuardians = voters.filter(({ outcome }) => outcome === expectedFinalRuling)
              const expectedLosingGuardians = filterGuardians(voters, expectedWinningGuardians)

              beforeEach('pass appeal and confirmation periods', async () => {
                await courtHelper.passTerms(courtHelper.appealTerms.add(courtHelper.appealConfirmTerms))
              })

              itIsAtState(roundId, ROUND_STATES.ENDED)
              itExecutesFinalRulingProperly(expectedFinalRuling)
              itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
            })

            context('when the round was appealed', () => {
              const appealedRuling = OUTCOMES.HIGH

              beforeEach('appeal', async () => {
                await courtHelper.appeal({ disputeId, roundId, appealMaker, ruling: appealedRuling })
              })

              context('when the appeal was not confirmed', () => {
                const expectedFinalRuling = appealedRuling
                const expectedWinningGuardians = voters.filter(({ outcome }) => outcome === expectedFinalRuling)
                const expectedLosingGuardians = filterGuardians(voters, expectedWinningGuardians)

                beforeEach('pass confirmation period', async () => {
                  await courtHelper.passTerms(courtHelper.appealConfirmTerms)
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itExecutesFinalRulingProperly(expectedFinalRuling)
                itSettlesPenaltiesAndRewardsProperly(roundId, expectedWinningGuardians, expectedLosingGuardians)
              })

              context('when the appeal was confirmed', () => {
                beforeEach('confirm appeal', async () => {
                  await courtHelper.confirmAppeal({ disputeId, roundId, appealTaker })
                })

                itIsAtState(roundId, ROUND_STATES.ENDED)
                itFailsToRuleAndSettleRound(roundId)

                context('when the next round is a regular round', () => {
                  const newRoundId = roundId + 1

                  const itHandlesRoundsSettlesProperly = (newRoundVoters, expectedFinalRuling) => {
                    const [firstRoundWinners, firstRoundLosers] = filterWinningGuardians(voters, expectedFinalRuling)
                    const [secondRoundWinners, secondRoundLosers] = filterWinningGuardians(newRoundVoters, expectedFinalRuling)

                    beforeEach('draft and vote second round', async () => {
                      const expectedNewRoundGuardiansNumber = 9 // previous guardians * 3 + 1
                      const { roundGuardiansNumber } = await courtHelper.getRound(disputeId, newRoundId)
                      assertBn(roundGuardiansNumber, expectedNewRoundGuardiansNumber, 'new round guardians number does not match')

                      await courtHelper.draft({ disputeId, maxGuardiansToBeDrafted: expectedNewRoundGuardiansNumber, draftedGuardians: newRoundVoters })
                      await courtHelper.commit({ disputeId, roundId: newRoundId, voters: newRoundVoters })
                      await courtHelper.reveal({ disputeId, roundId: newRoundId, voters: newRoundVoters })
                      await courtHelper.passTerms(courtHelper.appealTerms.add(courtHelper.appealConfirmTerms))
                    })

                    itExecutesFinalRulingProperly(expectedFinalRuling)

                    context('when settling first round', () => {
                      itSettlesPenaltiesAndRewardsProperly(roundId, firstRoundWinners, firstRoundLosers)
                    })

                    context('when settling second round', () => {
                      beforeEach('settle first round', async () => {
                        await disputeManager.settlePenalties(disputeId, roundId, 0)
                        for (const { address } of firstRoundWinners) {
                          await disputeManager.settleReward(disputeId, roundId, address)
                        }
                      })

                      itSettlesPenaltiesAndRewardsProperly(newRoundId, secondRoundWinners, secondRoundLosers)
                    })
                  }

                  context('when the ruling is sustained', async () => {
                    const expectedFinalRuling = OUTCOMES.LOW
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.LOW },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.LOW },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.LOW }
                    ]

                    itHandlesRoundsSettlesProperly(newRoundVoters, expectedFinalRuling)
                  })

                  context('when the ruling is flipped', async () => {
                    const expectedFinalRuling = appealedRuling
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.HIGH },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.HIGH },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.HIGH },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.HIGH }
                    ]

                    itHandlesRoundsSettlesProperly(newRoundVoters, expectedFinalRuling)
                  })

                  context('when the ruling is refused', async () => {
                    const expectedFinalRuling = OUTCOMES.REFUSED
                    const newRoundVoters = [
                      { address: guardian500,  weight: 1, outcome: OUTCOMES.REFUSED },
                      { address: guardian2000, weight: 4, outcome: OUTCOMES.REFUSED },
                      { address: guardian2500, weight: 1, outcome: OUTCOMES.REFUSED },
                      { address: guardian4000, weight: 2, outcome: OUTCOMES.REFUSED },
                      { address: guardian3000, weight: 1, outcome: OUTCOMES.REFUSED }
                    ]

                    itHandlesRoundsSettlesProperly(newRoundVoters, expectedFinalRuling)
                  })

                  context('when no one voted', async () => {
                    const expectedFinalRuling = OUTCOMES.REFUSED
                    const [firstRoundWinners, firstRoundLosers] = filterWinningGuardians(voters, expectedFinalRuling)
                    const newRoundDraftedGuardians = [
                      { address: guardian500,  weight: 1 },
                      { address: guardian2000, weight: 4 },
                      { address: guardian2500, weight: 1 },
                      { address: guardian4000, weight: 2 },
                      { address: guardian3000, weight: 1 }
                    ]

                    beforeEach('pass second round', async () => {
                      await courtHelper.draft({ disputeId, maxGuardiansToBeDrafted: 0, draftedGuardians: newRoundDraftedGuardians })
                      await courtHelper.passTerms(courtHelper.commitTerms.add(courtHelper.revealTerms).add(courtHelper.appealTerms).add(courtHelper.appealConfirmTerms))
                    })

                    itExecutesFinalRulingProperly(expectedFinalRuling)

                    context('when settling first round', () => {
                      itSettlesPenaltiesAndRewardsProperly(roundId, firstRoundWinners, firstRoundLosers)
                    })

                    context('when settling second round', () => {
                      beforeEach('settle first round', async () => {
                        await disputeManager.settlePenalties(disputeId, roundId, 0)
                        for (const { address } of firstRoundWinners) {
                          await disputeManager.settleReward(disputeId, roundId, address)
                        }
                      })

                      itSettlesPenaltiesAndRewardsProperly(newRoundId, [], newRoundDraftedGuardians)
                    })
                  })
                })

                context('when the next round is a final round', () => {
                  const finalRoundId = DEFAULTS.maxRegularAppealRounds.toNumber()

                  const itHandlesRoundsSettlesProperly = (finalRoundVoters, expectedFinalRuling) => {
                    const previousRoundsVoters = { [roundId]: voters }
                    const [expectedWinners, expectedLosers] = filterWinningGuardians(finalRoundVoters, expectedFinalRuling)

                    beforeEach('move to final round', async () => {
                      // appeal until we reach the final round, always flipping the previous round winning ruling
                      let previousWinningRuling = await voting.getWinningOutcome(voteId)
                      for (let nextRoundId = roundId + 1; nextRoundId < finalRoundId; nextRoundId++) {
                        const roundWinningRuling = oppositeOutcome(previousWinningRuling)
                        const roundVoters = await courtHelper.draft({ disputeId })
                        roundVoters.forEach(voter => voter.outcome = roundWinningRuling)
                        previousRoundsVoters[nextRoundId] = roundVoters

                        await courtHelper.commit({ disputeId, roundId: nextRoundId, voters: roundVoters })
                        await courtHelper.reveal({ disputeId, roundId: nextRoundId, voters: roundVoters })
                        await courtHelper.appeal({ disputeId, roundId: nextRoundId, appealMaker, ruling: previousWinningRuling })
                        await courtHelper.confirmAppeal({ disputeId, roundId: nextRoundId, appealTaker, ruling: roundWinningRuling })
                        previousWinningRuling = roundWinningRuling
                      }
                    })

                    beforeEach('end final round', async () => {
                      // commit and reveal votes, and pass appeal and confirmation periods to end dispute
                      await courtHelper.commit({ disputeId, roundId: finalRoundId, voters: finalRoundVoters })
                      await courtHelper.reveal({ disputeId, roundId: finalRoundId, voters: finalRoundVoters })
                      await courtHelper.passTerms(courtHelper.appealTerms.add(courtHelper.appealConfirmTerms))
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

                    afterEach('reactivate guardians and pass final round lock terms', async () => {
                      for (const { address, initialActiveBalance } of guardians) {
                        const { guardianToken, guardiansRegistry } = courtHelper
                        const unlockedBalance = await guardiansRegistry.unlockedActiveBalanceOf(address)

                        if (unlockedBalance.gt(initialActiveBalance)) {
                          const amount = unlockedBalance.sub(initialActiveBalance)
                          await guardiansRegistry.deactivate(amount, { from: address })
                        }

                        if (unlockedBalance.lt(initialActiveBalance)) {
                          const amount = initialActiveBalance.sub(unlockedBalance)
                          await guardianToken.generateTokens(address, amount)
                          await guardianToken.approveAndCall(guardiansRegistry.address, amount, ACTIVATE_DATA, { from: address })
                        }
                      }

                      await courtHelper.passTerms(DEFAULTS.finalRoundLockTerms)
                    })

                    itExecutesFinalRulingProperly(expectedFinalRuling)
                    itSettlesPenaltiesAndRewardsProperly(finalRoundId, expectedWinners, expectedLosers)
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
