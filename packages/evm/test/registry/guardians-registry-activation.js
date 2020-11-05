const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { roleId } = require('../helpers/utils/modules')
const { buildHelper } = require('../helpers/wrappers/protocol')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, someone, governor]) => {
  let controller, registry, disputeManager, ANT

  const MIN_ACTIVE_AMOUNT = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('create base contracts', async () => {
    controller = await buildHelper().deploy({ minActiveBalance: MIN_ACTIVE_AMOUNT, configGovernor: governor })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  describe('stakeAndActivate', () => {
    const itHandlesStakeAndActivateProperly = (sender) => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.stakeAndActivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
        })
      })

      context('when the given amount is lower than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

        context('when the sender has enough token balance', () => {
          beforeEach('mint and approve tokens', async () => {
            await ANT.generateTokens(sender, amount)
            await ANT.approve(registry.address, amount, { from: sender })
          })

          it('reverts', async () => {
            await assertRevert(registry.stakeAndActivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
          })
        })

        context('when the sender does not have enough token balance', () => {
          it('reverts', async () => {
            await assertRevert(registry.stakeAndActivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
          })
        })
      })

      context('when the given amount is greater than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

        context('when the sender has enough token balance', () => {
          beforeEach('mint and approve tokens', async () => {
            await ANT.generateTokens(sender, amount)
            await ANT.approve(registry.address, amount, { from: sender })
          })

          it('adds the staked amount to the active balance of the guardian', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
            assertBn(previousActiveBalance.add(amount), currentActiveBalance, 'guardian active balances do not match')

            assertBn(previousLockedBalance, currentLockedBalance, 'guardian locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'guardian available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'guardian deactivation balances do not match')
          })

          it('does not affect the active balance of the current term', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(guardian, termId)

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(guardian, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          if (guardian !== sender) {
            it('does not affect the sender balances', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(sender)

              await registry.stakeAndActivate(guardian, amount, { from: sender })

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(sender)
              assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
              assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
              assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
              assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
            })
          }

          it('updates the unlocked balance of the guardian', async () => {
            const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
            const previousGuardianUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            await controller.mockIncreaseTerm()
            const currentGuardianUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
            assertBn(previousGuardianUnlockedActiveBalance.add(amount), currentGuardianUnlockedActiveBalance, 'guardian unlocked balances do not match')

            if (guardian !== sender) {
              const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
              assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
            }
          })

          it('updates the total staked for the guardian', async () => {
            const previousSenderTotalStake = await registry.totalStakedFor(sender)
            const previousGuardianTotalStake = await registry.totalStakedFor(guardian)

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            const currentGuardianTotalStake = await registry.totalStakedFor(guardian)
            assertBn(previousGuardianTotalStake.add(amount), currentGuardianTotalStake, 'guardian total stake amounts do not match')

            if (guardian !== sender) {
              const currentSenderTotalStake = await registry.totalStakedFor(sender)
              assertBn(previousSenderTotalStake, currentSenderTotalStake, 'sender total stake amounts do not match')
            }
          })

          it('updates the total staked', async () => {
            const previousTotalStake = await registry.totalStaked()

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('transfers the tokens to the registry', async () => {
            const previousSenderBalance = await ANT.balanceOf(sender)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)
            const previousGuardianBalance = await ANT.balanceOf(guardian)

            await registry.stakeAndActivate(guardian, amount, { from: sender })

            const currentSenderBalance = await ANT.balanceOf(sender)
            assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')

            if (guardian !== sender) {
              const currentGuardianBalance = await ANT.balanceOf(guardian)
              assertBn(previousGuardianBalance, currentGuardianBalance, 'guardian balances do not match')
            }
          })

          it('emits a stake event', async () => {
            const previousTotalStake = await registry.totalStakedFor(guardian)

            const receipt = await registry.stakeAndActivate(guardian, amount, { from: sender })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
            assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { guardian: guardian, amount, total: previousTotalStake.add(amount) } })
          })

          it('emits an activation event', async () => {
            const termId = await controller.getCurrentTermId()

            const receipt = await registry.stakeAndActivate(guardian, amount, { from: sender })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
            assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian, fromTermId: termId.add(bn(1)), amount } })
          })
        })

        context('when the sender does not have enough token balance', () => {
          it('reverts', async () => {
            await assertRevert(registry.stakeAndActivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
          })
        })
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      itHandlesStakeAndActivateProperly(sender)
    })

    context('when the sender is not the guardian', () => {
      const sender = someone

      context('when the sender has permission', () => {
        beforeEach('grant role', async () => {
          await controller.grant(roleId(registry, 'stakeAndActivate'), sender, { from: governor })
        })

        itHandlesStakeAndActivateProperly(sender)
      })

      context('when the sender does not have permission', () => {
        beforeEach('revoke role', async () => {
          await controller.revoke(roleId(registry, 'stakeAndActivate'), sender, { from: governor })
        })

        it('reverts', async () => {
          await assertRevert(registry.stakeAndActivate(guardian, MIN_ACTIVE_AMOUNT, { from: sender }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })

  describe('activate', () => {
    const itHandlesActivationsProperly = (sender) => {
      context('when the guardian has not staked some tokens yet', () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
          })
        })
      })

      context('when the guardian has already staked some tokens', () => {
        const maxPossibleBalance = TOTAL_ACTIVE_BALANCE_LIMIT

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, maxPossibleBalance)
          await ANT.approve(registry.address, maxPossibleBalance, { from: sender })
          await registry.stake(guardian, maxPossibleBalance, { from: sender })
        })

        const itHandlesActivationProperlyFor = ({ requestedAmount, deactivationAmount = bn(0), deactivationDue = true }) => {
          it('adds the requested amount to the active balance of the guardian and removes it from the available balance', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            await registry.activate(guardian, requestedAmount, { from: sender })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)

            assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
            const activationAmount = requestedAmount.eq(bn(0))
              ? (deactivationDue ? previousAvailableBalance.add(previousDeactivationBalance) : previousAvailableBalance)
              : requestedAmount
            assertBn(previousAvailableBalance.add(deactivationAmount).sub(activationAmount), currentAvailableBalance, 'available balances do not match')
            assertBn(previousActiveBalance.add(activationAmount), currentActiveBalance, 'active balances do not match')
            assertBn(previousDeactivationBalance.sub(deactivationAmount), currentDeactivationBalance, 'deactivation balances do not match')
          })

          it('does not affect the active balance of the current term', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(guardian, termId)

            await registry.activate(guardian, requestedAmount, { from: sender })

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(guardian, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          it('increments the unlocked balance of the guardian', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

            const { available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            await registry.activate(guardian, requestedAmount, { from: sender })

            await controller.mockIncreaseTerm()
            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
            const activationAmount = requestedAmount.eq(bn(0))
              ? (deactivationDue ? previousAvailableBalance.add(previousDeactivationBalance) : previousAvailableBalance)
              : requestedAmount
            assertBn(previousUnlockedActiveBalance.add(activationAmount), currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('does not affect the staked balances', async () => {
            const previousTotalStake = await registry.totalStaked()
            const previousGuardianStake = await registry.totalStakedFor(guardian)

            await registry.activate(guardian, requestedAmount, { from: sender })

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake, currentTotalStake, 'total stake amounts do not match')

            const currentGuardianStake = await registry.totalStakedFor(guardian)
            assertBn(previousGuardianStake, currentGuardianStake, 'guardian stake amounts do not match')
          })

          it('does not affect the token balances', async () => {
            const previousGuardianBalance = await ANT.balanceOf(sender)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await registry.activate(guardian, requestedAmount, { from: sender })

            const currentSenderBalance = await ANT.balanceOf(sender)
            assertBn(previousGuardianBalance, currentSenderBalance, 'sender balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance, currentRegistryBalance, 'registry balances do not match')
          })

          it('emits an activation event', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const { available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            const receipt = await registry.activate(guardian, requestedAmount, { from: sender })

            const activationAmount = requestedAmount.eq(bn(0))
              ? (deactivationDue ? previousAvailableBalance.add(previousDeactivationBalance) : previousAvailableBalance)
              : requestedAmount
            assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
            assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian, fromTermId: termId.add(bn(1)), amount: activationAmount } })
          })

          if (deactivationAmount.gt(bn(0))) {
            it('emits a deactivation processed event', async () => {
              const termId = await controller.getCurrentTermId()
              const { availableTermId } = await registry.getDeactivationRequest(guardian)

              const receipt = await registry.activate(guardian, requestedAmount, { from: sender })

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian, amount: deactivationAmount, availableTermId, processedTermId: termId } })
            })
          }
        }

        const itHandlesDeactivationRequests = async (activeBalance) => {
          const deactivationAmount = activeBalance

          context('when the deactivation request is for the next term', () => {
            const currentAvailableBalance = maxPossibleBalance.sub(deactivationAmount)

            if (currentAvailableBalance > 0) {
              context('when the given amount is zero', () => {
                const amount = bn(0)

                itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationDue: false })
              })

              context('when the given amount is greater than the available balance', () => {
                const amount = currentAvailableBalance.add(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
                })
              })

              context('when the future active amount will be lower than the minimum active value', () => {
                const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
                })
              })

              context('when the future active amount will be greater than the minimum active value', () => {
                const amount = MIN_ACTIVE_AMOUNT

                itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationDue: false })
              })
            }
          })

          context('when the deactivation request is for the current term', () => {
            const currentAvailableBalance = maxPossibleBalance.sub(activeBalance).add(deactivationAmount)

            beforeEach('increment term', async () => {
              await controller.mockIncreaseTerm()
            })

            context('when the given amount is zero', () => {
              const amount = bn(0)

              itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationAmount })
            })

            context('when the given amount is greater than the available balance', () => {
              const amount = currentAvailableBalance.add(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
              })
            })

            context('when the future active amount will be lower than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
              })
            })

            context('when the future active amount will be greater than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT

              itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationAmount })
            })
          })

          context('when the deactivation request is for the previous term', () => {
            const currentAvailableBalance = maxPossibleBalance.sub(activeBalance).add(deactivationAmount)

            beforeEach('increment term twice', async () => {
              await controller.mockIncreaseTerm()
              await controller.mockIncreaseTerm()
            })

            context('when the given amount is zero', () => {
              const amount = bn(0)

              itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationAmount })
            })

            context('when the given amount is greater than the available balance', () => {
              const amount = currentAvailableBalance.add(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
              })
            })

            context('when the future active amount will be lower than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
              })
            })

            context('when the future active amount will be greater than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT

              itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationAmount })
            })
          })
        }

        context('when the guardian did not activate any tokens yet', () => {
          const itCreatesAnIdForTheGuardian = amount => {
            it('creates an id for the given guardian', async () => {
              await registry.activate(guardian, amount, { from: sender })

              const guardianId = await registry.getGuardianId(guardian)
              assertBn(guardianId, 1, 'guardian id does not match')
            })
          }

          context('when the given amount is zero', () => {
            const amount = bn(0)

            itCreatesAnIdForTheGuardian(amount)
            itHandlesActivationProperlyFor({ requestedAmount: amount })
          })

          context('when the given amount is lower than the minimum active value', () => {
            const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

            it('reverts', async () => {
              await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
            })
          })

          context('when the given amount is the total stake', () => {
            const amount = maxPossibleBalance

            itCreatesAnIdForTheGuardian(amount)
            itHandlesActivationProperlyFor({ requestedAmount: amount })
          })

          context('when the given amount is greater than the minimum active value without exceeding the limit', () => {
            const amount = MIN_ACTIVE_AMOUNT.add(bn(1))

            itCreatesAnIdForTheGuardian(amount)
            itHandlesActivationProperlyFor({ requestedAmount: amount })
          })

          context('when the given amount is greater than the minimum active value and exceeds the limit', () => {
            const amount = maxPossibleBalance.add(bn(1))

            it('reverts', async () => {
              // max possible balance was already allowed, allowing one more token
              await ANT.generateTokens(sender, 1)
              await ANT.approve(registry.address, 1, { from: sender })
              await registry.stake(guardian, 1, { from: sender })

              await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.TOTAL_ACTIVE_BALANCE_EXCEEDED)
            })
          })
        })

        context('when the guardian has already activated some tokens', () => {
          const activeBalance = MIN_ACTIVE_AMOUNT

          beforeEach('activate some tokens', async () => {
            await registry.activate(guardian, activeBalance, { from: sender })
          })

          context('when the guardian does not have a deactivation request', () => {
            context('when the given amount is zero', () => {
              const amount = bn(0)

              context('when the guardian was not slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('increase term', async () => {
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the guardian was slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('slash guardian', async () => {
                  await disputeManager.collect(guardian, bigExp(1, 18))
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the guardian was slashed and does not reach the minimum active amount of tokens', () => {
                beforeEach('slash guardian', async () => {
                  await disputeManager.collect(guardian, activeBalance)
                  await registry.unstake(guardian, maxPossibleBalance.sub(activeBalance).sub(bn(1)), { from: guardian })
                })

                it('reverts', async () => {
                  await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
                })
              })
            })

            context('when the given amount is greater than zero', () => {
              const amount = bigExp(2, 18)

              context('when the guardian was not slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('increase term', async () => {
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the guardian was slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('slash guardian', async () => {
                  await disputeManager.collect(guardian, amount)
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the guardian was slashed and does not reach the minimum active amount of tokens', () => {
                beforeEach('slash guardian', async () => {
                  await disputeManager.collect(guardian, activeBalance)
                })

                it('reverts', async () => {
                  await assertRevert(registry.activate(guardian, amount, { from: sender }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
                })
              })
            })
          })

          context('when the guardian has a full deactivation request', () => {
            beforeEach('deactivate tokens', async () => {
              await registry.deactivate(guardian, activeBalance, { from: guardian })
            })

            itHandlesDeactivationRequests(activeBalance)
          })
        })

        context('when the guardian has already activated all tokens', () => {
          const activeBalance = maxPossibleBalance

          beforeEach('activate tokens and deactivate', async () => {
            await registry.activate(guardian, activeBalance, { from: guardian })
            await registry.deactivate(guardian, activeBalance, { from: guardian })
          })

          itHandlesDeactivationRequests(activeBalance)
        })
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      itHandlesActivationsProperly(sender)
    })

    context('when the sender is not the guardian', () => {
      const sender = someone

      context('when the sender has permission', () => {
        beforeEach('grant role', async () => {
          await controller.grant(roleId(registry, 'activate'), sender, { from: governor })
        })

        itHandlesActivationsProperly(sender)
      })

      context('when the sender does not have permission', () => {
        beforeEach('revoke role', async () => {
          await controller.revoke(roleId(registry, 'activate'), sender, { from: governor })
        })

        it('reverts', async () => {
          await assertRevert(registry.activate(guardian, MIN_ACTIVE_AMOUNT, { from: sender }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })

  describe('deactivate',  () => {
    const itHandlesDeactivationsProperly = (sender) => {
      const itRevertsForDifferentAmounts = () => {
        context('when the requested amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the requested amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
          })
        })

        context('when the requested amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
          })
        })
      }

      context('when the guardian has not staked some tokens yet', () => {
        itRevertsForDifferentAmounts()
      })

      context('when the guardian has already staked some tokens', () => {
        const stakedBalance = MIN_ACTIVE_AMOUNT.mul(bn(5))

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, stakedBalance)
          await ANT.approve(registry.address, stakedBalance, { from: sender })
          await registry.stake(guardian, stakedBalance, { from: sender })
        })

        context('when the guardian did not activate any tokens yet', () => {
          itRevertsForDifferentAmounts()
        })

        context('when the guardian has already activated some tokens', () => {
          const activeBalance = MIN_ACTIVE_AMOUNT.mul(bn(4))

          beforeEach('activate some tokens', async () => {
            await registry.activate(guardian, activeBalance, { from: guardian })
          })

          const itHandlesDeactivationRequestFor = (requestedAmount, expectedAmount = requestedAmount, previousDeactivationAmount = bn(0)) => {
            it('decreases the active balance and increases the deactivation balance of the guardian', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

              await registry.deactivate(guardian, requestedAmount, { from: sender })

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)

              const expectedActiveBalance = previousActiveBalance.sub(expectedAmount)
              assertBn(currentActiveBalance, expectedActiveBalance, 'active balances do not match')

              const expectedAvailableBalance = previousAvailableBalance.add(previousDeactivationAmount)
              assertBn(currentAvailableBalance, expectedAvailableBalance, 'available balances do not match')

              const expectedDeactivationBalance = previousDeactivationBalance.add(expectedAmount).sub(previousDeactivationAmount)
              assertBn(currentDeactivationBalance, expectedDeactivationBalance, 'deactivation balances do not match')

              assertBn(currentLockedBalance, previousLockedBalance, 'locked balances do not match')
            })

            it('does not affect the active balance of the current term', async () => {
              const termId = await controller.getLastEnsuredTermId()
              const currentTermPreviousBalance = await registry.activeBalanceOfAt(guardian, termId)

              await registry.deactivate(guardian, requestedAmount, { from: sender })

              const currentTermCurrentBalance = await registry.activeBalanceOfAt(guardian, termId)
              assertBn(currentTermCurrentBalance, currentTermPreviousBalance, 'current term active balances do not match')
            })

            it('decreases the unlocked balance of the guardian', async () => {
              await controller.mockIncreaseTerm()
              const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

              await registry.deactivate(guardian, requestedAmount, { from: sender })

              await controller.mockIncreaseTerm()
              const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
              assertBn(currentUnlockedActiveBalance, previousUnlockedActiveBalance.sub(expectedAmount), 'unlocked balances do not match')
            })

            it('does not affect the staked balance of the guardian', async () => {
              const previousTotalStake = await registry.totalStaked()
              const previousGuardianStake = await registry.totalStakedFor(guardian)

              await registry.deactivate(guardian, requestedAmount, { from: sender })

              const currentTotalStake = await registry.totalStaked()
              assertBn(currentTotalStake, previousTotalStake, 'total stake amounts do not match')

              const currentGuardianStake = await registry.totalStakedFor(guardian)
              assertBn(currentGuardianStake, previousGuardianStake, 'guardian stake amounts do not match')
            })

            it('does not affect the token balances', async () => {
              const previousGuardianBalance = await ANT.balanceOf(sender)
              const previousRegistryBalance = await ANT.balanceOf(registry.address)

              await registry.deactivate(guardian, requestedAmount, { from: sender })

              const currentSenderBalance = await ANT.balanceOf(sender)
              assertBn(currentSenderBalance, previousGuardianBalance, 'guardian balances do not match')

              const currentRegistryBalance = await ANT.balanceOf(registry.address)
              assertBn(currentRegistryBalance, previousRegistryBalance, 'registry balances do not match')
            })

            it('emits a deactivation request created event', async () => {
              const termId = await controller.getLastEnsuredTermId()
              const receipt = await registry.deactivate(guardian, requestedAmount, { from: sender })

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { expectedArgs: { guardian, availableTermId: termId.add(bn(1)), amount: expectedAmount } })
            })

            it('can be requested at the next term', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

              await registry.deactivate(guardian, requestedAmount, { from: sender })
              await controller.mockIncreaseTerm()
              await registry.processDeactivationRequest(guardian)

              const { active: currentActiveBalance, available: currentAvailableBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)

              const expectedActiveBalance = previousActiveBalance.sub(expectedAmount)
              assertBn(currentActiveBalance, expectedActiveBalance, 'active balances do not match')

              const expectedAvailableBalance = previousAvailableBalance.add(previousDeactivationBalance).add(expectedAmount)
              assertBn(currentAvailableBalance, expectedAvailableBalance, 'available balances do not match')

              assertBn(currentDeactivationBalance, 0, 'deactivation balances do not match')
            })

            if (previousDeactivationAmount.gt(bn(0))) {
              it('emits a deactivation processed event', async () => {
                const termId = await controller.getCurrentTermId()
                const { availableTermId } = await registry.getDeactivationRequest(guardian)

                const receipt = await registry.deactivate(guardian, requestedAmount, { from: sender })

                assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
                assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian, amount: previousDeactivationAmount, availableTermId, processedTermId: termId } })
              })
            }
          }

          context('when the guardian does not have a deactivation request', () => {
            context('when the requested amount is zero', () => {
              const amount = bn(0)

              itHandlesDeactivationRequestFor(amount, activeBalance)
            })

            context('when the requested amount will make the active balance to be below the minimum active value', () => {
              const amount = activeBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
              })
            })

            context('when the requested amount will make the active balance to be above the minimum active value', () => {
              const amount = activeBalance.sub(MIN_ACTIVE_AMOUNT).sub(bn(1))

              itHandlesDeactivationRequestFor(amount)
            })

            context('when the requested amount will make the active balance to be zero', () => {
              const amount = activeBalance

              itHandlesDeactivationRequestFor(amount)
            })
          })

          context('when the guardian already has a previous deactivation request', () => {
            const previousDeactivationAmount = MIN_ACTIVE_AMOUNT
            const currentActiveBalance = activeBalance.sub(previousDeactivationAmount)

            beforeEach('deactivate tokens', async () => {
              await registry.deactivate(guardian, previousDeactivationAmount, { from: sender })
            })

            context('when the deactivation request is for the next term', () => {
              context('when the requested amount is zero', () => {
                const amount = bn(0)

                itHandlesDeactivationRequestFor(amount, currentActiveBalance)
              })

              context('when the requested amount will make the active balance to be below the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
                })
              })

              context('when the requested amount will make the active balance to be above the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).sub(bn(1))

                itHandlesDeactivationRequestFor(amount, amount)
              })

              context('when the requested amount will make the active balance to be zero', () => {
                const amount = currentActiveBalance

                itHandlesDeactivationRequestFor(amount, amount)
              })

              context('when the guardian has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await controller.grant(roleId(registry, 'lockActivation'), sender, { from: governor })
                  await registry.lockActivation(guardian, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
                })
              })
            })

            context('when the deactivation request is for the current term', () => {
              beforeEach('increment term', async () => {
                await controller.mockIncreaseTerm()
              })

              context('when the requested amount is zero', () => {
                const amount = bn(0)

                itHandlesDeactivationRequestFor(amount, currentActiveBalance, previousDeactivationAmount)
              })

              context('when the requested amount will make the active balance to be below the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
                })
              })

              context('when the requested amount will make the active balance to be above the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).sub(bn(1))

                itHandlesDeactivationRequestFor(amount, amount, previousDeactivationAmount)
              })

              context('when the requested amount will make the active balance be zero', () => {
                const amount = currentActiveBalance

                itHandlesDeactivationRequestFor(amount, amount, previousDeactivationAmount)
              })

              context('when the guardian has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await controller.grant(roleId(registry, 'lockActivation'), sender, { from: governor })
                  await registry.lockActivation(guardian, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
                })
              })
            })

            context('when the deactivation request is for the previous term', () => {
              beforeEach('increment term twice', async () => {
                await controller.mockIncreaseTerm()
                await controller.mockIncreaseTerm()
              })

              context('when the requested amount is zero', () => {
                const amount = bn(0)

                itHandlesDeactivationRequestFor(amount, currentActiveBalance, previousDeactivationAmount)
              })

              context('when the requested amount will make the active balance to be below the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
                })
              })

              context('when the requested amount will make the active balance to be above the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).sub(bn(1))

                itHandlesDeactivationRequestFor(amount, amount, previousDeactivationAmount)
              })

              context('when the requested amount will make the active balance be zero', () => {
                const amount = currentActiveBalance

                itHandlesDeactivationRequestFor(amount, amount, previousDeactivationAmount)
              })

              context('when the guardian has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await controller.grant(roleId(registry, 'lockActivation'), sender, { from: governor })
                  await registry.lockActivation(guardian, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(registry.deactivate(guardian, amount, { from: sender }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
                })
              })
            })
          })
        })
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      itHandlesDeactivationsProperly(sender)
    })

    context('when the sender is not the guardian', () => {
      const sender = someone

      context('when the sender has permission', () => {
        beforeEach('grant role', async () => {
          await controller.grant(roleId(registry, 'deactivate'), sender, { from: governor })
        })

        itHandlesDeactivationsProperly(sender)
      })

      context('when the sender does not have permission', () => {
        beforeEach('revoke role', async () => {
          await controller.revoke(roleId(registry, 'deactivate'), sender, { from: governor })
        })

        it('reverts', async () => {
          await assertRevert(registry.deactivate(guardian, MIN_ACTIVE_AMOUNT, { from: sender }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })
})
