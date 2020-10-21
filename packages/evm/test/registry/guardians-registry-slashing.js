const { ZERO_BYTES32, bn, bigExp, getEventAt, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { ACTIVATE_DATA, countGuardian } = require('../helpers/utils/guardians')
const { MATH_ERRORS, CONTROLLED_ERRORS, REGISTRY_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistryMock')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, secondGuardian, thirdGuardian, anyone]) => {
  let controller, registry, disputeManager, ANT

  const EMPTY_RANDOMNESS = ZERO_BYTES32
  const MIN_ACTIVE_AMOUNT = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)
  const DRAFT_LOCK_PCT = bn(2000) // 20%
  const DRAFT_LOCK_AMOUNT = MIN_ACTIVE_AMOUNT.mul(DRAFT_LOCK_PCT).div(bn(10000))

  before('create base contracts', async () => {
    controller = await buildHelper().deploy({ minActiveBalance: MIN_ACTIVE_AMOUNT })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  describe('slashOrUnlock', () => {
    context('when the sender is the dispute manager', () => {
      beforeEach('activate guardians', async () => {
        const firstGuardianBalance = MIN_ACTIVE_AMOUNT.mul(bn(10))
        await ANT.generateTokens(guardian, firstGuardianBalance)
        await ANT.approveAndCall(registry.address, firstGuardianBalance, ACTIVATE_DATA, { from: guardian })

        const secondGuardianBalance = MIN_ACTIVE_AMOUNT.mul(bn(5))
        await ANT.generateTokens(secondGuardian, secondGuardianBalance)
        await ANT.approveAndCall(registry.address, secondGuardianBalance, ACTIVATE_DATA, { from: secondGuardian })

        const thirdGuardianBalance = MIN_ACTIVE_AMOUNT.mul(bn(20))
        await ANT.generateTokens(thirdGuardian, thirdGuardianBalance)
        await ANT.approveAndCall(registry.address, thirdGuardianBalance, ACTIVATE_DATA, { from: thirdGuardian })

        await controller.mockIncreaseTerm()
      })

      context('when given input length does not match', () => {
        context('when given locked amounts do not match guardians length', () => {
          const guardians = []
          const lockedAmounts = [1]
          const rewardedGuardians = []

          it('reverts', async () => {
            await assertRevert(disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians), REGISTRY_ERRORS.INVALID_LOCKED_AMOUNTS_LEN)
          })
        })

        context('when given rewarded guardians do not match guardians length', () => {
          const guardians = []
          const lockedAmounts = []
          const rewardedGuardians = [true]

          it('reverts', async () => {
            await assertRevert(disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians), REGISTRY_ERRORS.INVALID_REWARDED_GUARDIANS_LEN)
          })
        })
      })

      context('when given input length matches', () => {
        context('when no guardians are given', () => {
          const guardians = []
          const lockedAmounts = []
          const rewardedGuardians = []

          it('does not collect tokens', async () => {
            const receipt = await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)
            assertEvent(receipt, REGISTRY_EVENTS.SLASHED, { expectedArgs: { collected: 0 } })
          })

          it('does not affect the balances of the guardians', async () => {
            const previousFirstGuardianBalances = await registry.balanceOf(guardian)
            const previousSecondGuardianBalances = await registry.balanceOf(secondGuardian)
            const previousThirdGuardianBalances = await registry.balanceOf(thirdGuardian)

            await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)

            const currentGuardianBalances = await registry.balanceOf(guardian)
            const currentSecondGuardianBalances = await registry.balanceOf(secondGuardian)
            const currentThirdGuardianBalances = await registry.balanceOf(thirdGuardian)

            for (let i = 0; i < currentGuardianBalances.length; i++) {
              assertBn(previousFirstGuardianBalances[i], currentGuardianBalances[i], `first guardian balance #${i} does not match`)
              assertBn(previousSecondGuardianBalances[i], currentSecondGuardianBalances[i], `second guardian balance #${i} does not match`)
              assertBn(previousThirdGuardianBalances[i], currentThirdGuardianBalances[i], `third guardian balance #${i} does not match`)
            }
          })
        })

        context('when some guardians are given', () => {
          const guardians = [guardian, secondGuardian, thirdGuardian]
          const rewardedGuardians = [false, true, false]

          beforeEach('draft guardians', async () => {
            // Mock registry draft forcing the following result
            const draftedGuardians = [guardian, secondGuardian, thirdGuardian]
            const draftedWeights = [3, 1, 6]
            await registry.mockNextDraft(draftedGuardians, draftedWeights)

            // Draft and make sure mock worked as expected
            const receipt = await disputeManager.draft(EMPTY_RANDOMNESS, 1, 0, 10, 10, DRAFT_LOCK_PCT)
            const { addresses } = getEventAt(receipt, 'Drafted').args

            assert.equal(countGuardian(addresses, guardian), 3, 'first drafted guardian weight does not match')
            assert.equal(countGuardian(addresses, secondGuardian), 1, 'second drafted guardian weight does not match')
            assert.equal(countGuardian(addresses, thirdGuardian), 6, 'third drafted guardian weight does not match')
          })

          context('when given lock amounts are valid', () => {
            const lockedAmounts = [DRAFT_LOCK_AMOUNT.mul(bn(3)), DRAFT_LOCK_AMOUNT, DRAFT_LOCK_AMOUNT.mul(bn(6))]

            it('collect tokens for all the slashed amounts', async () => {
              const receipt = await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)
              assertEvent(receipt, REGISTRY_EVENTS.SLASHED, { expectedArgs: { collected: DRAFT_LOCK_AMOUNT.mul(bn(9)) } })
            })

            it('unlocks balances of the rewarded guardians', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(secondGuardian)

              await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(secondGuardian)
              assertBn(previousLockedBalance.sub(DRAFT_LOCK_AMOUNT), currentLockedBalance, 'rewarded guardian locked balance does not match')
              assertBn(previousActiveBalance, currentActiveBalance, 'rewarded guardian active balance does not match')
              assertBn(previousAvailableBalance, currentAvailableBalance, 'rewarded guardian available balance does not match')
              assertBn(previousDeactivationBalance, currentDeactivationBalance, 'rewarded guardian deactivation balance does not match')
            })

            it('slashes the active balances of the not rewarded guardians', async () => {
              const { active: firstGuardianPreviousActiveBalance, available: firstGuardianPreviousAvailableBalance, locked: firstGuardianPreviousLockedBalance, pendingDeactivation: firstGuardianPreviousDeactivationBalance } = await registry.balanceOf(guardian)
              const { active: thirdGuardianPreviousActiveBalance, available: thirdGuardianPreviousAvailableBalance, locked: thirdGuardianPreviousLockedBalance, pendingDeactivation: thirdGuardianPreviousDeactivationBalance } = await registry.balanceOf(thirdGuardian)

              await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)

              const { active: firstGuardianCurrentActiveBalance, available: firstGuardianCurrentAvailableBalance, locked: firstGuardianCurrentLockedBalance, pendingDeactivation: firstGuardianCurrentDeactivationBalance } = await registry.balanceOf(guardian)
              assertBn(firstGuardianPreviousLockedBalance.sub(DRAFT_LOCK_AMOUNT.mul(bn(3))), firstGuardianCurrentLockedBalance, 'first slashed guardian locked balance does not match')
              assertBn(firstGuardianPreviousActiveBalance.sub(DRAFT_LOCK_AMOUNT.mul(bn(3))), firstGuardianCurrentActiveBalance, 'first slashed guardian active balance does not match')
              assertBn(firstGuardianPreviousAvailableBalance, firstGuardianCurrentAvailableBalance, 'first slashed guardian available balance does not match')
              assertBn(firstGuardianPreviousDeactivationBalance, firstGuardianCurrentDeactivationBalance, 'first slashed guardian deactivation balance does not match')

              const { active: thirdGuardianCurrentActiveBalance, available: thirdGuardianCurrentAvailableBalance, locked: thirdGuardianCurrentLockedBalance, pendingDeactivation: thirdGuardianCurrentDeactivationBalance } = await registry.balanceOf(thirdGuardian)
              assertBn(thirdGuardianPreviousLockedBalance.sub(DRAFT_LOCK_AMOUNT.mul(bn(6))), thirdGuardianCurrentLockedBalance, 'second slashed guardian locked balance does not match')
              assertBn(thirdGuardianPreviousActiveBalance.sub(DRAFT_LOCK_AMOUNT.mul(bn(6))), thirdGuardianCurrentActiveBalance, 'second slashed guardian active balance does not match')
              assertBn(thirdGuardianPreviousAvailableBalance, thirdGuardianCurrentAvailableBalance, 'second slashed guardian available balance does not match')
              assertBn(thirdGuardianPreviousDeactivationBalance, thirdGuardianCurrentDeactivationBalance, 'second slashed guardian deactivation balance does not match')
            })

            it('emits the corresponding events', async () => {
              const termId = await controller.getLastEnsuredTermId()

              const receipt = await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)
              let logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_SLASHED)

              assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_SLASHED, { expectedAmount: 2 })
              assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_SLASHED, { guardian: guardian, amount: DRAFT_LOCK_AMOUNT.mul(bn(3)), effectiveTermId: termId.add(bn(1)) }, 0)
              assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_SLASHED, { guardian: thirdGuardian, amount: DRAFT_LOCK_AMOUNT.mul(bn(6)), effectiveTermId: termId.add(bn(1)) }, 1)

              logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_BALANCE_UNLOCKED)
              assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_BALANCE_UNLOCKED, { expectedAmount: 1 })
              assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_BALANCE_UNLOCKED, { expectedArgs: { guardian: secondGuardian, amount: DRAFT_LOCK_AMOUNT } })
            })

            it('does not affect the active balances of the current term', async () => {
              let termId = await controller.getLastEnsuredTermId()
              const firstGuardianPreviousActiveBalance = await registry.activeBalanceOfAt(guardian, termId)
              const secondGuardianPreviousActiveBalance = await registry.activeBalanceOfAt(secondGuardian, termId)
              const thirdGuardianPreviousActiveBalance = await registry.activeBalanceOfAt(thirdGuardian, termId)

              await disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians)

              const firstGuardianCurrentActiveBalance = await registry.activeBalanceOfAt(guardian, termId)
              assertBn(firstGuardianPreviousActiveBalance, firstGuardianCurrentActiveBalance, 'first guardian active balance does not match')

              const secondGuardianCurrentActiveBalance = await registry.activeBalanceOfAt(secondGuardian, termId)
              assertBn(secondGuardianPreviousActiveBalance, secondGuardianCurrentActiveBalance, 'second guardian active balance does not match')

              const thirdGuardianCurrentActiveBalance = await registry.activeBalanceOfAt(thirdGuardian, termId)
              assertBn(thirdGuardianPreviousActiveBalance, thirdGuardianCurrentActiveBalance, 'third guardian active balance does not match')
            })
          })

          context('when given lock amounts are not valid', () => {
            const lockedAmounts = [DRAFT_LOCK_AMOUNT.mul(bn(10)), bn(0), bn(0)]

            it('reverts', async () => {
              await assertRevert(disputeManager.slashOrUnlock(guardians, lockedAmounts, rewardedGuardians), MATH_ERRORS.SUB_UNDERFLOW)
            })
          })
        })
      })
    })

    context('when the sender is not the dispute manager', () => {
      it('reverts', async () => {
        await assertRevert(registry.slashOrUnlock(0, [], [], []), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
      })
    })
  })

  describe('collectTokens', () => {
    context('when the sender is the dispute manager', () => {
      const itReturnsFalse = amount => {
        it('returns false', async () => {
          const receipt = await disputeManager.collect(guardian, amount)
          assertEvent(receipt, REGISTRY_EVENTS.COLLECTED, { expectedArgs: { collected: false } })
        })
      }

      const itHandlesTokensCollectionFor = (amount, deactivationReduced = bn(0)) => {
        it('returns true', async () => {
          const receipt = await disputeManager.collect(guardian, amount)
          assertEvent(receipt, REGISTRY_EVENTS.COLLECTED, { expectedArgs: { collected: true } })
        })

        it('decreases the active balance of the guardian', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

          await disputeManager.collect(guardian, amount)

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
          assertBn(previousDeactivationBalance.sub(deactivationReduced), currentDeactivationBalance, 'deactivation balances do not match')
          assertBn(previousActiveBalance.sub(amount).add(deactivationReduced), currentActiveBalance, 'active balances do not match')

          assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
          assertBn(previousAvailableBalance, currentAvailableBalance, 'available balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(guardian, termId)

          await disputeManager.collect(guardian, amount)

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(guardian, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        it('decreases the unlocked balance of the guardian', async () => {
          const pendingDeactivation = await registry.getDeactivationRequest(guardian)
          const currentTermId = await controller.getLastEnsuredTermId()

          let pendingDeactivationAmount = bn(0)
          if (pendingDeactivation.availableTermId.gt(currentTermId)) {
            pendingDeactivationAmount = pendingDeactivation.amount
          }
          // unlockedActivebalanceOf returns the balance for the current term, but there may be a deactivation scheduled for the next term
          const previousUnlockedActiveBalance = (await registry.unlockedActiveBalanceOf(guardian)).sub(pendingDeactivationAmount)

          await disputeManager.collect(guardian, amount)

          await controller.mockIncreaseTerm()
          const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
          assertBn(previousUnlockedActiveBalance.sub(amount).add(deactivationReduced), currentUnlockedActiveBalance, 'unlocked balances do not match')
        })

        it('decreases the staked balance of the guardian', async () => {
          const previousTotalStake = await registry.totalStaked()
          const previousGuardianStake = await registry.totalStakedFor(guardian)

          await disputeManager.collect(guardian, amount)

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake, currentTotalStake, 'total stake amounts do not match')

          const currentGuardianStake = await registry.totalStakedFor(guardian)
          assertBn(previousGuardianStake.sub(amount), currentGuardianStake, 'guardian stake amounts do not match')
        })

        const addBalances  = (balances) => balances.available.add(balances.active).add(balances.locked).add(balances.pendingDeactivation)

        it('keeps total balances consistent', async () => {
          const previousBalances = await registry.balanceOf(guardian)
          const previousTotalBalance = addBalances(previousBalances)

          await disputeManager.collect(guardian, amount)

          const currentBalances = await registry.balanceOf(guardian)
          const currentTotalBalance = addBalances(currentBalances)
          assertBn(previousTotalBalance, currentTotalBalance.add(amount), 'total balances do not match')
        })

        it('does not affect the token balances', async () => {
          const previousGuardianBalance = await ANT.balanceOf(guardian)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)

          await disputeManager.collect(guardian, amount)

          const currentSenderBalance = await ANT.balanceOf(guardian)
          assertBn(previousGuardianBalance, currentSenderBalance, 'guardian balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance, currentRegistryBalance, 'registry balances do not match')
        })

        if (amount.eq(bn(0))) {
          it('does not emit a guardian tokens collected event', async () => {
            const receipt = await disputeManager.collect(guardian, amount)
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_TOKENS_COLLECTED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_COLLECTED, { expectedAmount: 0 })
          })
        } else {
          it('emits a guardian tokens collected event', async () => {
            const termId = await controller.getLastEnsuredTermId()

            const receipt = await disputeManager.collect(guardian, amount)
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_TOKENS_COLLECTED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_COLLECTED)
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_COLLECTED, { expectedArgs: { guardian, amount, effectiveTermId: termId.add(bn(1)) } })
          })
        }

        it('does not process deactivation requests', async () => {
          const receipt = await disputeManager.collect(guardian, amount)

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedAmount: 0 })
        })

        if (!deactivationReduced.eq(bn(0))) {
          it('emits a deactivation request updated event', async () => {
            const termId = await controller.getCurrentTermId()
            const { amount: previousDeactivation, availableTermId } = await registry.getDeactivationRequest(guardian)

            const receipt = await disputeManager.collect(guardian, amount)
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_UPDATED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_UPDATED)
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_UPDATED, { expectedArgs: { guardian, availableTermId, updateTermId: termId, amount: previousDeactivation.sub(deactivationReduced) } })
          })
        }
      }

      context('when the guardian has not staked some tokens yet', () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          itHandlesTokensCollectionFor(amount)
        })

        context('when the given amount is greater than zero', () => {
          const amount = bigExp(50, 18)

          itReturnsFalse(amount)
        })
      })

      context('when the guardian has already staked some tokens', () => {
        const stakedBalance = MIN_ACTIVE_AMOUNT.mul(bn(5))

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(guardian, stakedBalance)
          await ANT.approveAndCall(registry.address, stakedBalance, '0x', { from: guardian })
        })

        context('when the guardian did not activate any tokens yet', () => {
          context('when the given amount is zero', () => {
            const amount = bn(0)

            itHandlesTokensCollectionFor(amount)
          })

          context('when the given amount is lower than the available balance of the guardian', () => {
            const amount = stakedBalance.sub(bn(1))

            itReturnsFalse(amount)
          })

          context('when the given amount is greater than the available balance of the guardian', () => {
            const amount = stakedBalance.add(bn(1))

            itReturnsFalse(amount)
          })
        })

        context('when the guardian has already activated some tokens', () => {
          const activeBalance = MIN_ACTIVE_AMOUNT.mul(bn(4))

          beforeEach('activate some tokens', async () => {
            await registry.activate(activeBalance, { from: guardian })
            await controller.mockIncreaseTerm()
          })

          context('when the guardian does not have a deactivation request', () => {
            context('when the given amount is zero', () => {
              const amount = bn(0)

              itHandlesTokensCollectionFor(amount)
            })

            context('when the given amount is lower than the active balance of the guardian', () => {
              const amount = activeBalance.sub(bn(1))

              itHandlesTokensCollectionFor(amount)
            })

            context('when the given amount is lower than the active balance of the guardian', () => {
              const amount = activeBalance.add(bn(1))

              itReturnsFalse(amount)
            })
          })

          context('when the guardian already has a previous deactivation request', () => {
            const deactivationAmount = MIN_ACTIVE_AMOUNT
            const currentActiveBalance = activeBalance.sub(deactivationAmount)

            beforeEach('deactivate tokens', async () => {
              await registry.deactivate(deactivationAmount, { from: guardian })
            })

            context('when the deactivation request is for the next term', () => {
              context('when the given amount is zero', () => {
                const amount = bn(0)

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is lower than the active balance of the guardian', () => {
                const amount = currentActiveBalance.sub(bn(1))

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is greater than the active balance of the guardian but fits with the future deactivation amount', () => {
                const deactivationReduced = bn(1)
                const amount = currentActiveBalance.add(deactivationReduced)

                itHandlesTokensCollectionFor(amount, deactivationReduced)
              })

              context('when the given amount is greater than the active balance of the guardian and does not fit with the future deactivation amount', () => {
                const amount = currentActiveBalance.add(deactivationAmount).add(bn(1))

                itReturnsFalse(amount)
              })
            })

            context('when the deactivation request is for the current term', () => {
              beforeEach('increment term', async () => {
                await controller.mockIncreaseTerm()
              })

              context('when the given amount is zero', () => {
                const amount = bn(0)

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is lower than the active balance of the guardian', () => {
                const amount = currentActiveBalance.sub(bn(1))

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is greater than the active balance of the guardian but fits with the future deactivation amount', () => {
                const amount = currentActiveBalance.add(bn(1))

                itReturnsFalse(amount)
              })

              context('when the given amount is greater than the active balance of the guardian and does not fit with the future deactivation amount', () => {
                const amount = currentActiveBalance.add(deactivationAmount).add(bn(1))

                itReturnsFalse(amount)
              })
            })

            context('when the deactivation request is for the previous term', () => {
              beforeEach('increment term twice', async () => {
                await controller.mockIncreaseTerm()
                await controller.mockIncreaseTerm()
              })

              context('when the given amount is zero', () => {
                const amount = bn(0)

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is lower than the available balance of the guardian', () => {
                const amount = currentActiveBalance.sub(bn(1))

                itHandlesTokensCollectionFor(amount)
              })

              context('when the given amount is greater than the active balance of the guardian but fits with the future deactivation amount', () => {
                const amount = currentActiveBalance.add(bn(1))

                itReturnsFalse(amount)
              })

              context('when the given amount is greater than the active balance of the guardian and does not fit with the future deactivation amount', () => {
                const amount = currentActiveBalance.add(deactivationAmount).add(bn(1))

                itReturnsFalse(amount)
              })
            })
          })
        })
      })
    })

    context('when the sender is not the dispute manager', () => {
      const from = anyone

      it('reverts', async () => {
        await assertRevert(registry.collectTokens(guardian, bigExp(100, 18), 0, { from }), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
      })
    })
  })
})
