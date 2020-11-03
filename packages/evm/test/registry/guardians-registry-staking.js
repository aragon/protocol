const { ZERO_ADDRESS, bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { encodeAuthorization } = require('../helpers/utils/modules')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS, SIGNATURES_VALIDATOR_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, governor]) => {
  let controller, registry, disputeManager, ANT

  const wallet = web3.eth.accounts.create('erc3009')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

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
    const itHandlesStakesProperlyFor = (recipient, amount, sender) => {
      context('when the sender has enough token balance', () => {
        beforeEach('mint and approve tokens', async () => {
          await ANT.generateTokens(sender, amount)
          await ANT.approve(registry.address, amount, { from: sender })
        })

        it('adds the staked amount to the available balance of the recipient', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

          await registry.stake(recipient, amount, { from: sender })

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
          assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'recipient available balances do not match')

          assertBn(previousActiveBalance, currentActiveBalance, 'recipient active balances do not match')
          assertBn(previousLockedBalance, currentLockedBalance, 'recipient locked balances do not match')
          assertBn(previousDeactivationBalance, currentDeactivationBalance, 'recipient deactivation balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

          await registry.stake(recipient, amount, { from: sender })

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        if (recipient !== sender) {
          it('does not affect the sender balances', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(sender)

            await registry.stake(recipient, amount, { from: sender })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(sender)
            assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })
        }

        it('does not affect the unlocked balance of the recipient', async () => {
          const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
          const previousRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

          await registry.stake(recipient, amount, { from: sender })

          await controller.mockIncreaseTerm()
          const currentRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
          assertBn(previousRecipientUnlockedActiveBalance, currentRecipientUnlockedActiveBalance, 'recipient unlocked balances do not match')

          if (recipient !== sender) {
            const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
            assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
          }
        })

        it('updates the total staked for the recipient', async () => {
          const previousSenderTotalStake = await registry.totalStakedFor(sender)
          const previousRecipientTotalStake = await registry.totalStakedFor(recipient)

          await registry.stake(recipient, amount, { from: sender })

          const currentRecipientTotalStake = await registry.totalStakedFor(recipient)
          assertBn(previousRecipientTotalStake.add(amount), currentRecipientTotalStake, 'recipient total stake amounts do not match')

          if (recipient !== sender) {
            const currentSenderTotalStake = await registry.totalStakedFor(sender)
            assertBn(previousSenderTotalStake, currentSenderTotalStake, 'sender total stake amounts do not match')
          }
        })

        it('updates the total staked', async () => {
          const previousTotalStake = await registry.totalStaked()

          await registry.stake(recipient, amount, { from: sender })

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('transfers the tokens to the registry', async () => {
          const previousSenderBalance = await ANT.balanceOf(sender)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)
          const previousRecipientBalance = await ANT.balanceOf(recipient)

          await registry.stake(recipient, amount, { from: sender })

          const currentSenderBalance = await ANT.balanceOf(sender)
          assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')

          if (recipient !== sender) {
            const currentRecipientBalance = await ANT.balanceOf(recipient)
            assertBn(previousRecipientBalance, currentRecipientBalance, 'recipient balances do not match')
          }
        })

        it('emits a stake event', async () => {
          const previousTotalStake = await registry.totalStakedFor(recipient)

          const receipt = await registry.stake(recipient, amount, { from: sender })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
          assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { guardian: recipient, amount, total: previousTotalStake.add(amount) } })
        })
      })

      context('when the sender does not have enough token balance', () => {
        it('reverts', async () => {
          await assertRevert(registry.stake(recipient, amount, { from: sender }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
        })
      })
    }

    const itHandlesStakesProperlyForDifferentAmounts = (recipient, sender) => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.stake(recipient, amount, { from: sender }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
        })
      })

      context('when the given amount is lower than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

        itHandlesStakesProperlyFor(recipient, amount, sender)
      })

      context('when the given amount is greater than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

        itHandlesStakesProperlyFor(recipient, amount, sender)
      })
    }

    context('when the recipient and the sender are the same', async () => {
      const sender = guardian
      const recipient = guardian

      itHandlesStakesProperlyForDifferentAmounts(recipient, sender)
    })

    context('when the recipient and the sender are not the same', async () => {
      const sender = guardian
      const recipient = externalAccount

      itHandlesStakesProperlyForDifferentAmounts(recipient, sender)
    })

    context('when the recipient is the zero address', async () => {
      const sender = guardian
      const recipient = ZERO_ADDRESS

      itHandlesStakesProperlyForDifferentAmounts(recipient, sender)
    })
  })

  describe('unstake', () => {
    const unstake = async (recipient, amount, sender, authorize = false) => {
      let calldata = registry.contract.methods.unstake(recipient, amount.toString()).encodeABI()
      if (authorize) calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
      return registry.sendTransaction({ from: sender, data: calldata })
    }

    const activate = async (recipient, amount, sender, authorize = false) => {
      let calldata = registry.contract.methods.activate(recipient, amount.toString()).encodeABI()
      if (authorize) calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
      return registry.sendTransaction({ from: sender, data: calldata })
    }

    const deactivate = async (recipient, amount, sender, authorize = false) => {
      let calldata = registry.contract.methods.deactivate(recipient, amount.toString()).encodeABI()
      if (authorize) calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
      return registry.sendTransaction({ from: sender, data: calldata })
    }

    const itHandlesUnstakesProperly = (recipient, sender, authorize = false) => {
      const itRevertsForDifferentAmounts = () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
          })
        })
      }

      context('when the recipient has not staked before', () => {
        itRevertsForDifferentAmounts()
      })

      context('when the recipient has already staked some tokens before', () => {
        const stakedBalance = MIN_ACTIVE_AMOUNT

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, stakedBalance)
          await ANT.approve(registry.address, stakedBalance, { from: sender })
          await registry.stake(recipient, stakedBalance, { from: sender })
        })

        const itHandlesUnstakesProperlyFor = (amount, deactivationAmount = bn(0)) => {
          it('removes the unstaked amount from the available balance of the recipient', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

            await unstake(recipient, amount, sender, authorize)

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
            assertBn(previousDeactivationBalance.sub(deactivationAmount), currentDeactivationBalance, 'deactivation balances do not match')
            assertBn(previousAvailableBalance.add(deactivationAmount).sub(amount), currentAvailableBalance, 'available balances do not match')

            assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
          })

          it('does not affect the unlocked balance of the recipient', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

            await unstake(recipient, amount, sender, authorize)

            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
            assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('updates the total staked', async () => {
            const previousTotalStake = await registry.totalStaked()

            await unstake(recipient, amount, sender, authorize)

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake.sub(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('updates the total staked for the recipient', async () => {
            const previousTotalStake = await registry.totalStakedFor(recipient)

            await unstake(recipient, amount, sender, authorize)

            const currentTotalStake = await registry.totalStakedFor(recipient)
            assertBn(previousTotalStake.sub(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('transfers the tokens to the recipient', async () => {
            const previousRecipientBalance = await ANT.balanceOf(recipient)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await unstake(recipient, amount, sender, authorize)

            const currentRecipientBalance = await ANT.balanceOf(recipient)
            assertBn(previousRecipientBalance.add(amount), currentRecipientBalance, 'recipient balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance.sub(amount), currentRegistryBalance, 'registry balances do not match')
          })

          it('emits an unstake event', async () => {
            const previousTotalStake = await registry.totalStakedFor(recipient)

            const receipt = await unstake(recipient, amount, sender, authorize)

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.UNSTAKED)
            assertEvent(receipt, REGISTRY_EVENTS.UNSTAKED, { expectedArgs: { guardian: recipient, amount, total: previousTotalStake.sub(amount) } })
          })

          if (deactivationAmount.gt(bn(0))) {
            it('emits a deactivation processed event', async () => {
              const termId = await controller.getCurrentTermId()
              const { availableTermId } = await registry.getDeactivationRequest(recipient)

              const receipt = await unstake(recipient, amount, sender, authorize)

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian: recipient, amount: deactivationAmount, availableTermId, processedTermId: termId } })
            })
          }
        }

        context('when the recipient tokens were not activated', () => {
          context('when the given amount is zero', () => {
            const amount = bn(0)

            it('reverts', async () => {
              await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
            })
          })

          context('when the given amount is lower than the available balance', () => {
            const amount = stakedBalance.sub(bn(1))

            itHandlesUnstakesProperlyFor(amount)
          })

          context('when the given amount is greater than the available balance', () => {
            const amount = stakedBalance.add(bn(1))

            it('reverts', async () => {
              await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
            })
          })
        })

        context('when the recipient tokens were activated', () => {
          const activeAmount = stakedBalance

          beforeEach('activate tokens', async () => {
            await activate(recipient, stakedBalance, sender, true)
          })

          context('when the recipient tokens were not deactivated', () => {
            itRevertsForDifferentAmounts()
          })

          context('when the recipient tokens were deactivated', () => {
            const deactivationAmount = activeAmount

            beforeEach('deactivate tokens', async () => {
              await deactivate(recipient, deactivationAmount, sender, true)
            })

            context('when the recipient tokens are deactivated for the next term', () => {
              itRevertsForDifferentAmounts()
            })

            context('when the recipient tokens are deactivated for the current term', () => {
              beforeEach('increment term', async () => {
                await controller.mockIncreaseTerm()
              })

              context('when the given amount is zero', () => {
                const amount = bn(0)

                it('reverts', async () => {
                  await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
                })
              })

              context('when the given amount is lower than the available balance', () => {
                const amount = stakedBalance.sub(bn(1))

                itHandlesUnstakesProperlyFor(amount, deactivationAmount)
              })

              context('when the given amount is greater than the available balance', () => {
                const amount = stakedBalance.add(bn(1))

                it('reverts', async () => {
                  await assertRevert(unstake(recipient, amount, sender, authorize), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
                })
              })
            })
          })
        })
      })
    }

    context('when the sender is the recipient', () => {
      const sender = guardian
      const recipient = guardian

      itHandlesUnstakesProperly(recipient, sender)
    })

    context('when the sender is not the recipient', () => {
      const sender = guardian
      const recipient = externalAccount

      context('when the sender is authorized by recipient', () => {
        const authorize = true

        itHandlesUnstakesProperly(recipient, sender, authorize)
      })

      context('when the sender is not authorized by recipient', () => {
        const authorized = false

        it('reverts', async () => {
          await assertRevert(unstake(recipient, MIN_ACTIVE_AMOUNT, sender, authorized), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
        })
      })
    })
  })
})
