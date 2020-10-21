const { ZERO_ADDRESS, bn, bigExp, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { ACTIVATE_DATA } = require('../helpers/utils/guardians')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, anotherGuardian]) => {
  let controller, registry, disputeManager, ANT

  const MIN_ACTIVE_AMOUNT = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('create protocol and custom disputes module', async () => {
    controller = await buildHelper().deploy({ minActiveBalance: MIN_ACTIVE_AMOUNT })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  describe('stake', () => {
    const from = guardian

    context('when the guardian does not request to activate the tokens', () => {
      const data = '0xabcdef0123456789'

      const itHandlesStakesProperlyFor = (amount, data) => {
        context('when the guardian has enough token balance', () => {
          beforeEach('mint and approve tokens', async () => {
            await ANT.generateTokens(from, amount)
            await ANT.approve(registry.address, amount, { from })
          })

          it('adds the staked amount to the available balance of the guardian', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            await registry.stake(amount, data, { from })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
            assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'available balances do not match')

            assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })

          it('does not affect the active balance of the current term', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(from, termId)

            await registry.stake(amount, data, { from })

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(from, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          it('does not affect the unlocked balance of the guardian', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

            await registry.stake(amount, data, { from })

            await controller.mockIncreaseTerm()
            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
            assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('updates the total staked for the guardian', async () => {
            const previousTotalStake = await registry.totalStakedFor(guardian)

            await registry.stake(amount, data, { from })

            const currentTotalStake = await registry.totalStakedFor(guardian)
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('updates the total staked', async () => {
            const previousTotalStake = await registry.totalStaked()

            await registry.stake(amount, data, { from })

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('transfers the tokens to the registry', async () => {
            const previousSenderBalance = await ANT.balanceOf(from)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await registry.stake(amount, data, { from })

            const currentSenderBalance = await ANT.balanceOf(from)
            assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')
          })

          it('emits a stake event', async () => {
            const previousTotalStake = await registry.totalStakedFor(guardian)

            const receipt = await registry.stake(amount, data, { from })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
            assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: guardian, amount, total: previousTotalStake.add(amount), data } })
          })
        })

        context('when the guardian does not have enough token balance', () => {
          it('reverts', async () => {
            await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
          })
        })
      }

      const itHandlesStakesProperlyForDifferentAmounts = (data) => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          itHandlesStakesProperlyFor(amount, data)
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          itHandlesStakesProperlyFor(amount, data)
        })
      }

      context('when the guardian has not staked before', () => {
        itHandlesStakesProperlyForDifferentAmounts(data)
      })

      context('when the guardian has already staked some tokens before', () => {
        beforeEach('stake some tokens', async () => {
          const initialAmount = bigExp(50, 18)
          await ANT.generateTokens(from, initialAmount)
          await ANT.approve(registry.address, initialAmount, { from })
          await registry.stake(initialAmount, '0x', { from })
        })

        itHandlesStakesProperlyForDifferentAmounts(data)
      })
    })

    context('when the guardian requests to activate the tokens', () => {
      const data = ACTIVATE_DATA

      const itHandlesStakesProperlyFor = (amount, data) => {
        it('adds the staked amount to the active balance of the guardian', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

          await registry.stake(amount, data, { from })

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
          assertBn(previousActiveBalance.add(amount), currentActiveBalance, 'active balances do not match')

          assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
          assertBn(previousAvailableBalance, currentAvailableBalance, 'available balances do not match')
          assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(from, termId)

          await registry.stake(amount, data, { from })

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(from, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        it('updates the unlocked balance of the guardian', async () => {
          const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

          await registry.stake(amount, data, { from })

          await controller.mockIncreaseTerm()
          const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
          assertBn(previousUnlockedActiveBalance.add(amount), currentUnlockedActiveBalance, 'unlocked balances do not match')
        })

        it('updates the total staked for the guardian', async () => {
          const previousTotalStake = await registry.totalStakedFor(guardian)

          await registry.stake(amount, data, { from })

          const currentTotalStake = await registry.totalStakedFor(guardian)
          assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('updates the total staked', async () => {
          const previousTotalStake = await registry.totalStaked()

          await registry.stake(amount, data, { from })

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('transfers the tokens to the registry', async () => {
          const previousSenderBalance = await ANT.balanceOf(from)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)

          await registry.stake(amount, data, { from })

          const currentSenderBalance = await ANT.balanceOf(from)
          assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')
        })

        it('emits a stake event', async () => {
          const previousTotalStake = await registry.totalStakedFor(guardian)

          const receipt = await registry.stake(amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
          assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: guardian, amount, total: previousTotalStake.add(amount), data } })
        })

        it('emits an activation event', async () => {
          const termId = await controller.getCurrentTermId()

          const receipt = await registry.stake(amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
          assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian, fromTermId: termId.add(bn(1)), amount, sender: from } })
        })
      }

      const itHandlesStakesProperlyForDifferentAmounts = (data) => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          context('when the guardian has enough token balance', () => {
            beforeEach('mint and approve tokens', async () => {
              await ANT.generateTokens(from, amount)
              await ANT.approve(registry.address, amount, { from })
            })

            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
            })
          })

          context('when the guardian does not have enough token balance', () => {
            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
            })
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          context('when the guardian has enough token balance', () => {
            beforeEach('mint and approve tokens', async () => {
              await ANT.generateTokens(from, amount)
              await ANT.approve(registry.address, amount, { from })
            })

            itHandlesStakesProperlyFor(amount, data)
          })

          context('when the guardian does not have enough token balance', () => {
            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
            })
          })
        })
      }

      context('when the guardian has not staked before', () => {
        itHandlesStakesProperlyForDifferentAmounts(data)
      })

      context('when the guardian has already staked some tokens before', () => {
        beforeEach('stake some tokens', async () => {
          const initialAmount = bigExp(50, 18)
          await ANT.generateTokens(from, initialAmount)
          await ANT.approve(registry.address, initialAmount, { from })
          await registry.stake(initialAmount, '0x', { from })
        })

        itHandlesStakesProperlyForDifferentAmounts(data)
      })
    })
  })

  describe('stake for', () => {
    const from = guardian

    const itHandlesStakesWithoutActivationProperlyFor = (recipient, amount, data) => {
      context('when the guardian has enough token balance', () => {
        beforeEach('mint and approve tokens', async () => {
          await ANT.generateTokens(from, amount)
          await ANT.approve(registry.address, amount, { from })
        })

        it('adds the staked amount to the available balance of the recipient', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
          assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'recipient available balances do not match')

          assertBn(previousActiveBalance, currentActiveBalance, 'recipient active balances do not match')
          assertBn(previousLockedBalance, currentLockedBalance, 'recipient locked balances do not match')
          assertBn(previousDeactivationBalance, currentDeactivationBalance, 'recipient deactivation balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        if (recipient !== from) {
          it('does not affect the sender balances', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(from)

            await registry.stakeFor(recipient, amount, data, { from })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(from)
            assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })
        }

        it('does not affect the unlocked balance of the recipient', async () => {
          const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(from)
          const previousRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          await controller.mockIncreaseTerm()
          const currentRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
          assertBn(previousRecipientUnlockedActiveBalance, currentRecipientUnlockedActiveBalance, 'recipient unlocked balances do not match')

          if (recipient !== from) {
            const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(from)
            assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
          }
        })

        it('updates the total staked for the recipient', async () => {
          const previousSenderTotalStake = await registry.totalStakedFor(from)
          const previousRecipientTotalStake = await registry.totalStakedFor(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentRecipientTotalStake = await registry.totalStakedFor(recipient)
          assertBn(previousRecipientTotalStake.add(amount), currentRecipientTotalStake, 'recipient total stake amounts do not match')

          if (recipient !== from) {
            const currentSenderTotalStake = await registry.totalStakedFor(from)
            assertBn(previousSenderTotalStake, currentSenderTotalStake, 'sender total stake amounts do not match')
          }
        })

        it('updates the total staked', async () => {
          const previousTotalStake = await registry.totalStaked()

          await registry.stakeFor(recipient, amount, data, { from })

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('transfers the tokens to the registry', async () => {
          const previousSenderBalance = await ANT.balanceOf(from)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)
          const previousRecipientBalance = await ANT.balanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentSenderBalance = await ANT.balanceOf(from)
          assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')

          if (recipient !== from) {
            const currentRecipientBalance = await ANT.balanceOf(recipient)
            assertBn(previousRecipientBalance, currentRecipientBalance, 'recipient balances do not match')
          }
        })

        it('emits a stake event', async () => {
          const previousTotalStake = await registry.totalStakedFor(recipient)

          const receipt = await registry.stakeFor(recipient, amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
          assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: recipient, amount, total: previousTotalStake.add(amount), data } })
        })
      })

      context('when the guardian does not have enough token balance', () => {
        it('reverts', async () => {
          await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
        })
      })
    }

    const itHandlesStakesWithoutActivationProperlyForDifferentAmounts = (recipient, data) => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
        })
      })

      context('when the given amount is lower than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

        itHandlesStakesWithoutActivationProperlyFor(recipient, amount, data)
      })

      context('when the given amount is greater than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

        itHandlesStakesWithoutActivationProperlyFor(recipient, amount, data)
      })
    }

    context('when the guardian does not request to activate the tokens', () => {
      const data = '0xabcdef0123456789'

      const itHandlesStakesProperlyForDifferentRecipients = (data) => {
        context('when the recipient and the sender are the same', async () => {
          const recipient = from

          itHandlesStakesWithoutActivationProperlyForDifferentAmounts(recipient, data)
        })

        context('when the recipient and the sender are not the same', async () => {
          const recipient = anotherGuardian

          itHandlesStakesWithoutActivationProperlyForDifferentAmounts(recipient, data)
        })

        context('when the recipient is the zero address', async () => {
          const recipient = ZERO_ADDRESS

          itHandlesStakesWithoutActivationProperlyForDifferentAmounts(recipient, data)
        })
      }

      context('when the guardian has not staked before', () => {
        itHandlesStakesProperlyForDifferentRecipients(data)
      })

      context('when the guardian has already staked some tokens before', () => {
        beforeEach('stake some tokens', async () => {
          const initialAmount = bigExp(50, 18)
          await ANT.generateTokens(from, initialAmount)
          await ANT.approve(registry.address, initialAmount, { from })
          await registry.stake(initialAmount, '0x', { from })
        })

        itHandlesStakesProperlyForDifferentRecipients(data)
      })
    })

    context('when the guardian requests to activate the tokens', () => {
      const data = ACTIVATE_DATA

      const itHandlesStakesWithActivationProperlyFor = (recipient, amount, data) => {
        it('adds the staked amount to the active balance of the recipient', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
          assertBn(previousActiveBalance.add(amount), currentActiveBalance, 'recipient active balances do not match')

          assertBn(previousLockedBalance, currentLockedBalance, 'recipient locked balances do not match')
          assertBn(previousAvailableBalance, currentAvailableBalance, 'recipient available balances do not match')
          assertBn(previousDeactivationBalance, currentDeactivationBalance, 'recipient deactivation balances do not match')
        })

        it('does not affect the active balance of the current term', async () => {
          const termId = await controller.getLastEnsuredTermId()
          const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
          assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
        })

        if (recipient !== from) {
          it('does not affect the sender balances', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(from)

            await registry.stakeFor(recipient, amount, data, { from })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(from)
            assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
            assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })
        }

        it('updates the unlocked balance of the recipient', async () => {
          const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(from)
          const previousRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          await controller.mockIncreaseTerm()
          const currentRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
          assertBn(previousRecipientUnlockedActiveBalance.add(amount), currentRecipientUnlockedActiveBalance, 'recipient unlocked balances do not match')

          if (recipient !== from) {
            const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(from)
            assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
          }
        })

        it('updates the total staked for the recipient', async () => {
          const previousSenderTotalStake = await registry.totalStakedFor(from)
          const previousRecipientTotalStake = await registry.totalStakedFor(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentRecipientTotalStake = await registry.totalStakedFor(recipient)
          assertBn(previousRecipientTotalStake.add(amount), currentRecipientTotalStake, 'recipient total stake amounts do not match')

          if (recipient !== from) {
            const currentSenderTotalStake = await registry.totalStakedFor(from)
            assertBn(previousSenderTotalStake, currentSenderTotalStake, 'sender total stake amounts do not match')
          }
        })

        it('updates the total staked', async () => {
          const previousTotalStake = await registry.totalStaked()

          await registry.stake(amount, data, { from })

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('transfers the tokens to the registry', async () => {
          const previousSenderBalance = await ANT.balanceOf(from)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)
          const previousRecipientBalance = await ANT.balanceOf(recipient)

          await registry.stakeFor(recipient, amount, data, { from })

          const currentSenderBalance = await ANT.balanceOf(from)
          assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')

          if (recipient !== from) {
            const currentRecipientBalance = await ANT.balanceOf(recipient)
            assertBn(previousRecipientBalance, currentRecipientBalance, 'recipient balances do not match')
          }
        })

        it('emits a stake event', async () => {
          const previousTotalStake = await registry.totalStakedFor(recipient)

          const receipt = await registry.stakeFor(recipient, amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
          assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: recipient, amount, total: previousTotalStake.add(amount), data } })
        })

        it('emits an activation event', async () => {
          const termId = await controller.getCurrentTermId()

          const receipt = await registry.stakeFor(recipient, amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
          assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian: recipient, fromTermId: termId.add(bn(1)), amount, sender: from } })
        })
      }

      const itHandlesStakesWithActivationProperlyForDifferentAmounts = (recipient, data) => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          context('when the guardian has enough token balance', () => {
            beforeEach('mint and approve tokens', async () => {
              await ANT.generateTokens(from, amount)
              await ANT.approve(registry.address, amount, { from })
            })

            it('reverts', async () => {
              await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
            })
          })

          context('when the guardian does not have enough token balance', () => {
            it('reverts', async () => {
              await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
            })
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          context('when the guardian has enough token balance', () => {
            beforeEach('mint and approve tokens', async () => {
              await ANT.generateTokens(from, amount)
              await ANT.approve(registry.address, amount, { from })
            })

            itHandlesStakesWithActivationProperlyFor(recipient, amount, data)
          })

          context('when the guardian does not have enough token balance', () => {
            it('reverts', async () => {
              await assertRevert(registry.stakeFor(recipient, amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
            })
          })
        })
      }

      const itHandlesStakesProperlyForDifferentRecipients = (data) => {
        context('when the recipient and the sender are the same', async () => {
          const recipient = from

          itHandlesStakesWithActivationProperlyForDifferentAmounts(recipient, data)
        })

        context('when the recipient and the sender are not the same', async () => {
          const recipient = anotherGuardian

          itHandlesStakesWithActivationProperlyForDifferentAmounts(recipient, data)
        })

        context('when the recipient is the zero address', async () => {
          const recipient = ZERO_ADDRESS

          itHandlesStakesWithActivationProperlyForDifferentAmounts(recipient, data)
        })
      }

      context('when the guardian has not staked before', () => {
        itHandlesStakesProperlyForDifferentRecipients(data)
      })

      context('when the guardian has already staked some tokens before', () => {
        beforeEach('stake some tokens', async () => {
          const initialAmount = bigExp(50, 18)
          await ANT.generateTokens(from, initialAmount)
          await ANT.approve(registry.address, initialAmount, { from })
          await registry.stake(initialAmount, '0x', { from })
        })

        itHandlesStakesProperlyForDifferentRecipients(data)
      })
    })
  })

  describe('approve and call', () => {
    const from = guardian

    context('when the calling contract is ANT', () => {
      context('when the guardian does not request to activate the tokens', () => {
        const data = '0xabcdef0123456789'

        const itHandlesStakesProperlyFor = (amount, data) => {
          context('when the guardian has enough token balance', () => {
            beforeEach('mint', async () => {
              await ANT.generateTokens(from, amount)
            })

            it('adds the staked amount to the available balance of the guardian', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

              await ANT.approveAndCall(registry.address, amount, data, { from })

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
              assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'available balances do not match')

              assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
              assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
              assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
            })

            it('does not affect the unlocked balance of the guardian', async () => {
              const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

              await ANT.approveAndCall(registry.address, amount, data, { from })

              await controller.mockIncreaseTerm()
              const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
              assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
            })

            it('updates the total staked for the guardian', async () => {
              const previousTotalStake = await registry.totalStakedFor(guardian)

              await ANT.approveAndCall(registry.address, amount, data, { from })

              const currentTotalStake = await registry.totalStakedFor(guardian)
              assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
            })

            it('updates the total staked', async () => {
              const previousTotalStake = await registry.totalStaked()

              await ANT.approveAndCall(registry.address, amount, data, { from })

              const currentTotalStake = await registry.totalStaked()
              assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
            })

            it('transfers the tokens to the registry', async () => {
              const previousSenderBalance = await ANT.balanceOf(from)
              const previousRegistryBalance = await ANT.balanceOf(registry.address)

              await ANT.approveAndCall(registry.address, amount, data, { from })

              const currentSenderBalance = await ANT.balanceOf(from)
              assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

              const currentRegistryBalance = await ANT.balanceOf(registry.address)
              assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')
            })

            it('emits a stake event', async () => {
              const previousTotalStake = await registry.totalStakedFor(guardian)

              const receipt = await ANT.approveAndCall(registry.address, amount, data, { from })
              const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.STAKED)

              assertAmountOfEvents({ logs }, REGISTRY_EVENTS.STAKED)
              assertEvent({ logs }, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: guardian, amount, total: previousTotalStake.add(amount), data } })
            })
          })

          context('when the guardian does not have enough token balance', () => {
            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
            })
          })
        }

        const itHandlesStakesProperlyForDifferentAmounts = (data) => {
          context('when the given amount is zero', () => {
            const amount = bn(0)

            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
            })
          })

          context('when the given amount is lower than the minimum active value', () => {
            const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

            itHandlesStakesProperlyFor(amount, data)
          })

          context('when the given amount is greater than the minimum active value', () => {
            const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

            itHandlesStakesProperlyFor(amount, data)
          })
        }

        context('when the guardian has not staked before', () => {
          itHandlesStakesProperlyForDifferentAmounts(data)
        })

        context('when the guardian has already staked some tokens before', () => {
          beforeEach('stake some tokens', async () => {
            const initialAmount = bigExp(50, 18)
            await ANT.generateTokens(from, initialAmount)
            await ANT.approveAndCall(registry.address, initialAmount, '0x', { from })
          })

          itHandlesStakesProperlyForDifferentAmounts(data)
        })
      })

      context('when the guardian requests to activate the tokens', () => {
        const data = ACTIVATE_DATA

        const itHandlesStakesProperlyFor = (amount, data) => {
          it('adds the staked amount to the active balance of the guardian', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

            await ANT.approveAndCall(registry.address, amount, data, { from })

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
            assertBn(previousActiveBalance.add(amount), currentActiveBalance, 'active balances do not match')

            assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
          })

          it('does not affect the active balance of the current term', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(from, termId)

            await ANT.approveAndCall(registry.address, amount, data, { from })

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(from, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          it('updates the unlocked balance of the guardian', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

            await ANT.approveAndCall(registry.address, amount, data, { from })

            await controller.mockIncreaseTerm()
            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
            assertBn(previousUnlockedActiveBalance.add(amount), currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('updates the total staked for the guardian', async () => {
            const previousTotalStake = await registry.totalStakedFor(guardian)

            await ANT.approveAndCall(registry.address, amount, data, { from })

            const currentTotalStake = await registry.totalStakedFor(guardian)
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('updates the total staked', async () => {
            const previousTotalStake = await registry.totalStaked()

            await ANT.approveAndCall(registry.address, amount, data, { from })

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('transfers the tokens to the registry', async () => {
            const previousSenderBalance = await ANT.balanceOf(from)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await ANT.approveAndCall(registry.address, amount, data, { from })

            const currentSenderBalance = await ANT.balanceOf(from)
            assertBn(previousSenderBalance.sub(amount), currentSenderBalance, 'sender balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance.add(amount), currentRegistryBalance, 'registry balances do not match')
          })

          it('emits a stake event', async () => {
            const previousTotalStake = await registry.totalStakedFor(guardian)

            const receipt = await ANT.approveAndCall(registry.address, amount, data, { from })
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.STAKED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.STAKED)
            assertEvent({ logs }, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: guardian, amount, total: previousTotalStake.add(amount), data } })
          })

          it('emits an activation event', async () => {
            const termId = await controller.getCurrentTermId()

            const receipt = await ANT.approveAndCall(registry.address, amount, data, { from })
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian, fromTermId: termId.add(bn(1)), amount, sender: from } })
          })
        }

        const itHandlesStakesProperlyForDifferentAmounts = (data) => {
          context('when the given amount is zero', () => {
            const amount = bn(0)

            it('reverts', async () => {
              await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
            })
          })

          context('when the given amount is lower than the minimum active value', () => {
            const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

            context('when the guardian has enough token balance', () => {
              beforeEach('mint tokens', async () => {
                await ANT.generateTokens(from, amount)
              })

              it('reverts', async () => {
                await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
              })
            })

            context('when the guardian does not have enough token balance', () => {
              it('reverts', async () => {
                await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
              })
            })
          })

          context('when the given amount is greater than the minimum active value', () => {
            const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

            context('when the guardian has enough token balance', () => {
              beforeEach('mint tokens', async () => {
                await ANT.generateTokens(from, amount)
              })

              itHandlesStakesProperlyFor(amount, data)
            })

            context('when the guardian does not have enough token balance', () => {
              it('reverts', async () => {
                await assertRevert(registry.stake(amount, data, { from }), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
              })
            })
          })
        }

        context('when the guardian has not staked before', () => {
          itHandlesStakesProperlyForDifferentAmounts(data)
        })

        context('when the guardian has already staked some tokens before', () => {
          beforeEach('stake some tokens', async () => {
            const initialAmount = bigExp(50, 18)
            await ANT.generateTokens(from, initialAmount)
            await ANT.approveAndCall(registry.address, initialAmount, '0x', { from })
          })

          itHandlesStakesProperlyForDifferentAmounts(data)
        })
      })
    })

    context('when the calling contract is another token', () => {
      it('reverts', async () => {
        const anotherToken = await ERC20.new('Another Token', 'ATK', 18)
        const guardianBalance = bigExp(100, 18)
        await anotherToken.generateTokens(guardian, guardianBalance)

        await assertRevert(anotherToken.approveAndCall(registry.address, guardianBalance, ACTIVATE_DATA, { from: guardian }), REGISTRY_ERRORS.TOKEN_APPROVE_NOT_ALLOWED)
      })
    })
  })

  describe('unstake', () => {
    const from = guardian
    const data = '0xabcdef0123456789'

    const itRevertsForDifferentAmounts = () => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
        })
      })

      context('when the given amount is lower than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

        it('reverts', async () => {
          await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
        })
      })

      context('when the given amount is greater than the minimum active value', () => {
        const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

        it('reverts', async () => {
          await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
        })
      })
    }

    context('when the guardian has not staked before', () => {
      itRevertsForDifferentAmounts()
    })

    context('when the guardian has already staked some tokens before', () => {
      const stakedBalance = MIN_ACTIVE_AMOUNT

      beforeEach('stake some tokens', async () => {
        await ANT.generateTokens(from, stakedBalance)
        await ANT.approve(registry.address, stakedBalance, { from })
        await registry.stake(stakedBalance, '0x', { from })
      })

      const itHandlesUnstakesProperlyFor = (amount, deactivationAmount = bn(0)) => {
        it('removes the unstaked amount from the available balance of the guardian', async () => {
          const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(guardian)

          await registry.unstake(amount, data, { from })

          const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(guardian)
          assertBn(previousDeactivationBalance.sub(deactivationAmount), currentDeactivationBalance, 'deactivation balances do not match')
          assertBn(previousAvailableBalance.add(deactivationAmount).sub(amount), currentAvailableBalance, 'available balances do not match')

          assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
          assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
        })

        it('does not affect the unlocked balance of the guardian', async () => {
          const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)

          await registry.unstake(amount, data, { from })

          const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian)
          assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
        })

        it('updates the total staked', async () => {
          const previousTotalStake = await registry.totalStaked()

          await registry.unstake(amount, data, { from })

          const currentTotalStake = await registry.totalStaked()
          assertBn(previousTotalStake.sub(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('updates the total staked for the guardian', async () => {
          const previousTotalStake = await registry.totalStakedFor(guardian)

          await registry.unstake(amount, data, { from })

          const currentTotalStake = await registry.totalStakedFor(guardian)
          assertBn(previousTotalStake.sub(amount), currentTotalStake, 'total stake amounts do not match')
        })

        it('transfers the tokens to the guardian', async () => {
          const previousSenderBalance = await ANT.balanceOf(from)
          const previousRegistryBalance = await ANT.balanceOf(registry.address)

          await registry.unstake(amount, data, { from })

          const currentSenderBalance = await ANT.balanceOf(from)
          assertBn(previousSenderBalance.add(amount), currentSenderBalance, 'sender balances do not match')

          const currentRegistryBalance = await ANT.balanceOf(registry.address)
          assertBn(previousRegistryBalance.sub(amount), currentRegistryBalance, 'registry balances do not match')
        })

        it('emits an unstake event', async () => {
          const previousTotalStake = await registry.totalStakedFor(guardian)

          const receipt = await registry.unstake(amount, data, { from })

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.UNSTAKED)
          assertEvent(receipt, REGISTRY_EVENTS.UNSTAKED, { expectedArgs: { user: guardian, amount, total: previousTotalStake.sub(amount), data } })
        })

        if (deactivationAmount.gt(bn(0))) {
          it('emits a deactivation processed event', async () => {
            const termId = await controller.getCurrentTermId()
            const { availableTermId } = await registry.getDeactivationRequest(guardian)

            const receipt = await registry.unstake(amount, data, { from })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
            assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian, amount: deactivationAmount, availableTermId, processedTermId: termId } })
          })
        }
      }

      context('when the guardian tokens were not activated', () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the available balance', () => {
          const amount = stakedBalance.sub(bn(1))

          itHandlesUnstakesProperlyFor(amount)
        })

        context('when the given amount is greater than the available balance', () => {
          const amount = stakedBalance.add(bn(1))

          it('reverts', async () => {
            await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
          })
        })
      })

      context('when the guardian tokens were activated', () => {
        const activeAmount = stakedBalance

        beforeEach('activate tokens', async () => {
          await registry.activate(stakedBalance, { from })
        })

        context('when the guardian tokens were not deactivated', () => {
          itRevertsForDifferentAmounts()
        })

        context('when the guardian tokens were deactivated', () => {
          const deactivationAmount = activeAmount

          beforeEach('deactivate tokens', async () => {
            await registry.deactivate(deactivationAmount, { from })
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
                await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
              })
            })

            context('when the given amount is lower than the available balance', () => {
              const amount = stakedBalance.sub(bn(1))

              itHandlesUnstakesProperlyFor(amount, deactivationAmount)
            })

            context('when the given amount is greater than the available balance', () => {
              const amount = stakedBalance.add(bn(1))

              it('reverts', async () => {
                await assertRevert(registry.unstake(amount, data, { from }), REGISTRY_ERRORS.NOT_ENOUGH_AVAILABLE_BALANCE)
              })
            })
          })
        })
      })
    })
  })
})
