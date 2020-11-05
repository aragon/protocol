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

  before('create protocol and custom disputes module', async () => {
    controller = await buildHelper().deploy({ minActiveBalance: MIN_ACTIVE_AMOUNT, configGovernor: governor })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  describe('stake', () => {
    const itHandlesStakesProperlyFor = (amount, sender) => {
      context('when the sender has enough token balance', () => {
        beforeEach('mint and approve tokens', async () => {
          await ANT.generateTokens(sender, amount)
          await ANT.approve(registry.address, amount, { from: sender })
        })

        it('adds the staked amount to the available balance of the guardian', async () => {
          const {
            active: previousActiveBalance,
            available: previousAvailableBalance,
            locked: previousLockedBalance,
            pendingDeactivation: previousDeactivationBalance
          } = await registry.detailedBalanceOf(guardian)

          await registry.stake(guardian, amount, { from: sender })

          const {
            active: currentActiveBalance,
            available: currentAvailableBalance,
            locked: currentLockedBalance,
            pendingDeactivation: currentDeactivationBalance
          } = await registry.detailedBalanceOf(guardian)

          assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'guardian available balances do not match')
          assertBn(previousActiveBalance, currentActiveBalance, 'guardian active balances do not match')
          assertBn(previousLockedBalance, currentLockedBalance, 'guardian locked balances do not match')
          assertBn(previousDeactivationBalance, currentDeactivationBalance, 'guardian deactivation balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(guardian, termId)

          await registry.stake(guardian, amount, { from: sender })

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(guardian, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        if (guardian !== sender) {
          it('does not affect the sender balances', async () => {
            const {
              active: previousActiveBalance,
              available: previousAvailableBalance,
              locked: previousLockedBalance,
              pendingDeactivation: previousDeactivationBalance
            } = await registry.detailedBalanceOf(sender)

            await registry.stake(guardian, amount, { from: sender })

            const {
              active: currentActiveBalance,
              available: currentAvailableBalance,
              locked: currentLockedBalance,
              pendingDeactivation: currentDeactivationBalance
            } = await registry.detailedBalanceOf(sender)

            assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })
        }

        it('does not affect the unlocked balance of the guardian', async () => {
          const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
          const previousGuardianUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

          await registry.stake(guardian, amount, { from: sender })

          await controller.mockIncreaseTerm()
          const currentGuardianUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
          assertBn(previousGuardianUnlockedActiveBalance, currentGuardianUnlockedActiveBalance, 'guardian unlocked balances do not match')

          if (guardian !== sender) {
            const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
            assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
          }
        })

        it('updates the staked registry balance of the guardian', async () => {
          const previousSenderBalance = await registry.balanceOf(sender)
          const previousGuardianBalance = await registry.balanceOf(guardian)

          await registry.stake(guardian, amount, { from: sender })

          const currentGuardianBalance = await registry.balanceOf(guardian)
          assertBn(previousGuardianBalance.add(amount), currentGuardianBalance, 'guardian staked balances do not match')

          if (guardian !== sender) {
            const currentSenderBalance = await registry.balanceOf(sender)
            assertBn(previousSenderBalance, currentSenderBalance, 'sender staked balances do not match')
          }
        })

        it('updates the total staked', async () => {
          const previousTotalSupplyStaked = await registry.totalSupply()

          await registry.stake(guardian, amount, { from: sender })

          const currentTotalSupplyStaked = await registry.totalSupply()
          assertBn(previousTotalSupplyStaked.add(amount), currentTotalSupplyStaked, 'total staked supplies do not match')
        })

        it('transfers the tokens to the registry', async () => {
          const previousSenderBalance = await ANT.balanceOf(sender)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)
          const previousGuardianBalance = await ANT.balanceOf(guardian)

          await registry.stake(guardian, amount, { from: sender })

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
          const previousBalance = await registry.balanceOf(guardian)

          const receipt = await registry.stake(guardian, amount, { from: sender })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
          assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { guardian: guardian, amount, total: previousBalance.add(amount) } })
        })
      })

      context('when the sender does not have enough token balance', () => {
        it('reverts', async () => {
          await assertRevert(registry.stake(guardian, amount, { from: sender }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
        })
      })
    }

    const itHandlesStakesProperlyForDifferentAmounts = (sender) => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.stake(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
        })
      })

      context('when the given amount is lower than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

        itHandlesStakesProperlyFor(amount, sender)
      })

      context('when the given amount is greater than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

        itHandlesStakesProperlyFor(amount, sender)
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      itHandlesStakesProperlyForDifferentAmounts(sender)
    })

    context('when the sender is not the guardian', () => {
      const sender = someone

      itHandlesStakesProperlyForDifferentAmounts(sender)
    })
  })

  describe('unstake', () => {
    const itHandlesUnstakesProperly = sender => {
      const itRevertsForDifferentAmounts = () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
          })
        })
      }

      context('when the guardian has not staked before', () => {
        itRevertsForDifferentAmounts()
      })

      context('when the guardian has already staked some tokens before', () => {
        const stakedBalance = MIN_ACTIVE_AMOUNT

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, stakedBalance)
          await ANT.approve(registry.address, stakedBalance, { from: sender })
          await registry.stake(guardian, stakedBalance, { from: sender })
        })

        const itHandlesUnstakesProperlyFor = (amount, deactivationAmount = bn(0)) => {
          it('removes the unstaked amount from the available balance of the guardian', async () => {
            const {
              active: previousActiveBalance,
              available: previousAvailableBalance,
              locked: previousLockedBalance,
              pendingDeactivation: previousDeactivationBalance
            } = await registry.detailedBalanceOf(guardian)

            await registry.unstake(guardian, amount, { from: sender })

            const {
              active: currentActiveBalance,
              available: currentAvailableBalance,
              locked: currentLockedBalance,
              pendingDeactivation: currentDeactivationBalance
            } = await registry.detailedBalanceOf(guardian)

            assertBn(previousDeactivationBalance.sub(deactivationAmount), currentDeactivationBalance, 'deactivation balances do not match')
            assertBn(previousAvailableBalance.add(deactivationAmount).sub(amount), currentAvailableBalance, 'available balances do not match')
            assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
          })

          it('does not affect the unlocked balance of the guardian', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

            await registry.unstake(guardian, amount, { from: sender })

            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
            assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('updates the total staked', async () => {
            const previousTotalSupplyStaked = await registry.totalSupply()

            await registry.unstake(guardian, amount, { from: sender })

            const currentTotalSupplyStaked = await registry.totalSupply()
            assertBn(previousTotalSupplyStaked.sub(amount), currentTotalSupplyStaked, 'total stake supplies do not match')
          })

          it('updates the staked registry balance of the guardian', async () => {
            const previousBalance = await registry.balanceOf(guardian)

            await registry.unstake(guardian, amount, { from: sender })

            const currentBalance = await registry.balanceOf(guardian)
            assertBn(previousBalance.sub(amount), currentBalance, 'guardian staked balances do not match')
          })

          it('transfers the tokens to the guardian', async () => {
            const previousGuardianBalance = await ANT.balanceOf(guardian)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await registry.unstake(guardian, amount, { from: sender })

            const currentGuardianBalance = await ANT.balanceOf(guardian)
            assertBn(previousGuardianBalance.add(amount), currentGuardianBalance, 'guardian balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance.sub(amount), currentRegistryBalance, 'registry balances do not match')
          })

          it('emits an unstake event', async () => {
            const previousBalance = await registry.balanceOf(guardian)

            const receipt = await registry.unstake(guardian, amount, { from: sender })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.UNSTAKED)
            assertEvent(receipt, REGISTRY_EVENTS.UNSTAKED, { expectedArgs: { guardian: guardian, amount, total: previousBalance.sub(amount) } })
          })

          if (deactivationAmount.gt(bn(0))) {
            it('emits a deactivation processed event', async () => {
              const termId = await controller.getCurrentTermId()
              const { availableTermId } = await registry.getDeactivationRequest(guardian)

              const receipt = await registry.unstake(guardian, amount, { from: sender })

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian, amount: deactivationAmount, availableTermId, processedTermId: termId } })
            })
          }
        }

        context('when the guardian tokens were not activated', () => {
          context('when the given amount is zero', () => {
            const amount = bn(0)

            it('reverts', async () => {
              await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
            })
          })

          context('when the given amount is lower than the available balance', () => {
            const amount = stakedBalance.sub(bn(1))

            itHandlesUnstakesProperlyFor(amount)
          })

          context('when the given amount is greater than the available balance', () => {
            const amount = stakedBalance.add(bn(1))

            it('reverts', async () => {
              await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
            })
          })
        })

        context('when the guardian tokens were activated', () => {
          const activeAmount = stakedBalance

          beforeEach('activate tokens', async () => {
            await registry.activate(guardian, stakedBalance, { from: guardian })
          })

          context('when the guardian tokens were not deactivated', () => {
            itRevertsForDifferentAmounts()
          })

          context('when the guardian tokens were deactivated', () => {
            const deactivationAmount = activeAmount

            beforeEach('deactivate tokens', async () => {
              await registry.deactivate(guardian, deactivationAmount, { from: guardian })
            })

            context('when the guardian tokens are deactivated for the next term', () => {
              itRevertsForDifferentAmounts()
            })

            context('when the guardian tokens are deactivated for the current term', () => {
              beforeEach('increment term', async () => {
                await controller.mockIncreaseTerm()
              })

              context('when the given amount is zero', () => {
                const amount = bn(0)

                it('reverts', async () => {
                  await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
                })
              })

              context('when the given amount is lower than the available balance', () => {
                const amount = stakedBalance.sub(bn(1))

                itHandlesUnstakesProperlyFor(amount, deactivationAmount)
              })

              context('when the given amount is greater than the available balance', () => {
                const amount = stakedBalance.add(bn(1))

                it('reverts', async () => {
                  await assertRevert(registry.unstake(guardian, amount, { from: sender }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
                })
              })
            })
          })
        })
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      itHandlesUnstakesProperly(sender)
    })

    context('when the sender is not the guardian', () => {
      const sender = someone

      context('when the sender has permission', () => {
        beforeEach('grant role', async () => {
          await controller.grant(roleId(registry, 'unstake'), sender, { from: governor })
        })

        itHandlesUnstakesProperly(sender)
      })

      context('when the sender does not have permission', () => {
        beforeEach('revoke role', async () => {
          await controller.revoke(roleId(registry, 'unstake'), sender, { from: governor })
        })

        it('reverts', async () => {
          await assertRevert(registry.unstake(guardian, MIN_ACTIVE_AMOUNT, { from: sender }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })
})
