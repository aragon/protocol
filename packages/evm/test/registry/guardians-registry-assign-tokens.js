const { MAX_UINT256, bn, bigExp, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { MATH_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, someone]) => {
  let controller, registry, disputeManager, ANT

  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)
  const BURN_ADDRESS = '0x000000000000000000000000000000000000dead'

  before('create base contracts', async () => {
    controller = await buildHelper().deploy()
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  const itHandlesZeroTokenAssignmentsProperly = (assignmentCall, recipient) => {
    it('does not affect any of the balances', async () => {
      const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
      const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

      await assignmentCall()

      await controller.mockIncreaseTerm()
      const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
      assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')

      const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
      assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
      assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
      assertBn(previousAvailableBalance, currentAvailableBalance, 'available balances do not match')
      assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
    })

    it('does not affect the staked balance', async () => {
      const previousTotalStake = await registry.totalStaked()
      const previousGuardianStake = await registry.totalStakedFor(recipient)

      await assignmentCall()

      const currentTotalStake = await registry.totalStaked()
      assertBn(previousTotalStake, currentTotalStake, 'total stake amounts do not match')

      const currentGuardianStake = await registry.totalStakedFor(recipient)
      assertBn(previousGuardianStake, currentGuardianStake, 'recipient stake amounts do not match')
    })

    it('does not affect the token balances', async () => {
      const previousGuardianBalance = await ANT.balanceOf(recipient)
      const previousRegistryBalance = await ANT.balanceOf(registry.address)

      await assignmentCall()

      const currentSenderBalance = await ANT.balanceOf(recipient)
      assertBn(previousGuardianBalance, currentSenderBalance, 'recipient balances do not match')

      const currentRegistryBalance = await ANT.balanceOf(registry.address)
      assertBn(previousRegistryBalance, currentRegistryBalance, 'registry balances do not match')
    })

    it('does not emit a guardian rewarded event', async () => {
      const receipt = await assignmentCall()
      const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_TOKENS_ASSIGNED)

      assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_ASSIGNED, { expectedAmount: 0 })
    })
  }

  const itHandlesTokenAssignmentsProperly = (assignmentCall, recipient, amount) => {
    it('adds the given amount to the available balance', async () => {
      const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

      await assignmentCall()

      const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
      assertBn(previousAvailableBalance.add(amount), currentAvailableBalance, 'available balances do not match')

      assertBn(previousLockedBalance, currentLockedBalance, 'locked balances do not match')
      assertBn(previousActiveBalance, currentActiveBalance, 'active balances do not match')
      assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
    })

    it('does not affect the unlocked balance of the recipient', async () => {
      const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

      await assignmentCall()

      await controller.mockIncreaseTerm()
      const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
      assertBn(previousUnlockedActiveBalance, currentUnlockedActiveBalance, 'unlocked balances do not match')
    })

    it('increments the staked balance for the recipient', async () => {
      const previousTotalStake = await registry.totalStaked()
      const previousGuardianStake = await registry.totalStakedFor(recipient)

      await assignmentCall()

      const currentTotalStake = await registry.totalStaked()
      assertBn(previousTotalStake, currentTotalStake, 'total stake amounts do not match')

      const currentGuardianStake = await registry.totalStakedFor(recipient)
      assertBn(previousGuardianStake.add(amount), currentGuardianStake, 'recipient stake amounts do not match')
    })

    it('does not affect the token balances', async () => {
      const previousGuardianBalance = await ANT.balanceOf(recipient)
      const previousRegistryBalance = await ANT.balanceOf(registry.address)

      await assignmentCall()

      const currentSenderBalance = await ANT.balanceOf(recipient)
      assertBn(previousGuardianBalance, currentSenderBalance, 'recipient balances do not match')

      const currentRegistryBalance = await ANT.balanceOf(registry.address)
      assertBn(previousRegistryBalance, currentRegistryBalance, 'registry balances do not match')
    })
  }

  describe('assignTokens', () => {
    context('when the sender is the dispute manager', () => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        itHandlesZeroTokenAssignmentsProperly(() => disputeManager.assignTokens(guardian, amount), guardian)
      })

      context('when the given amount is greater than zero', () => {
        const itEmitsAGuardianTokensAssignedEvent = (assignmentCall, recipient, amount) => {
          it('emits a guardian rewarded event', async () => {
            const receipt = await assignmentCall()
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_TOKENS_ASSIGNED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_ASSIGNED)
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_ASSIGNED, { expectedArgs: { guardian: recipient, amount } })
          })
        }

        context('when the guardian did not have balance', () => {
          const amount = bigExp(100, 18)

          itHandlesTokenAssignmentsProperly(() => disputeManager.assignTokens(guardian, amount), guardian, amount)
          itEmitsAGuardianTokensAssignedEvent(() => disputeManager.assignTokens(guardian, amount), guardian, amount)
        })

        context('when the guardian already had some balance', () => {
          beforeEach('stake some balance', async () => {
            const initialBalance = bigExp(50, 18)
            await ANT.generateTokens(guardian, initialBalance)
            await ANT.approveAndCall(registry.address, initialBalance, '0x', { from: guardian })
          })

          context('when the given amount does not overflow', () => {
            const amount = bigExp(100, 18)

            itHandlesTokenAssignmentsProperly(() => disputeManager.assignTokens(guardian, amount), guardian, amount)
            itEmitsAGuardianTokensAssignedEvent(() => disputeManager.assignTokens(guardian, amount), guardian, amount)
          })

          context('when the given amount does overflow', () => {
            const amount = MAX_UINT256

            it('reverts', async () => {
              await assertRevert(disputeManager.assignTokens(guardian, amount), MATH_ERRORS.ADD_OVERFLOW)
            })
          })
        })
      })
    })

    context('when the sender is not the dispute manager', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(registry.assignTokens(guardian, bigExp(100, 18), { from }), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
      })
    })
  })

  describe('burnTokens', () => {
    context('when the sender is the dispute manager', () => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        itHandlesZeroTokenAssignmentsProperly(() => disputeManager.burnTokens(amount), BURN_ADDRESS)
      })

      context('when the given amount is greater than zero', () => {
        const itEmitsAGuardianTokensBurnedEvent = (assignmentCall, amount) => {
          it('emits a burned tokens event', async () => {
            const receipt = await assignmentCall()
            const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_TOKENS_BURNED)

            assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_BURNED)
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_TOKENS_BURNED, { expectedArgs: { amount } })
          })
        }

        context('when the guardian did not have balance', () => {
          const amount = bigExp(100, 18)

          itHandlesTokenAssignmentsProperly(() => disputeManager.burnTokens(amount), BURN_ADDRESS, amount)
          itEmitsAGuardianTokensBurnedEvent(() => disputeManager.burnTokens(amount), amount)
        })

        context('when the burn address already had some balance', () => {
          beforeEach('burn some balance', async () => {
            await disputeManager.burnTokens(bigExp(50, 18))
          })

          context('when the given amount does not overflow', () => {
            const amount = bigExp(100, 18)

            itHandlesTokenAssignmentsProperly(() => disputeManager.burnTokens(amount), BURN_ADDRESS, amount)
            itEmitsAGuardianTokensBurnedEvent(() => disputeManager.burnTokens(amount), amount)
          })

          context('when the given amount does overflow', () => {
            const amount = MAX_UINT256

            it('reverts', async () => {
              await assertRevert(disputeManager.burnTokens(amount), MATH_ERRORS.ADD_OVERFLOW)
            })
          })
        })
      })
    })

    context('when the sender is not the dispute manager', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(registry.burnTokens(bigExp(100, 18), { from }), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
      })
    })
  })
})
