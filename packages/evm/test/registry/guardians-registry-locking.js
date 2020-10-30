const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { ANY_ENTITY } = require('@aragon/contract-helpers-test/src/aragon-os/acl')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { ACTIVATE_DATA } = require('../helpers/utils/guardians')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const LockManager = artifacts.require('LockManagerMock')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, someone, governor]) => {
  let controller, registry, ANT, lockManager, anotherLockManager

  before('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor })
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, bigExp(100e6, 18))
    await controller.setGuardiansRegistry(registry.address)
  })

  beforeEach('create lock managers', async () => {
    lockManager = await LockManager.new(registry.address)
    anotherLockManager = await LockManager.new(registry.address)
  })

  const activateTokens = async (amount) => {
    await ANT.generateTokens(guardian, amount)
    await ANT.approveAndCall(registry.address, amount, ACTIVATE_DATA, { from: guardian })
  }

  describe('lockActivation', () => {
    const lockAmount = bigExp(1000, 18)

    const allowLockManager = (address, allowed) => {
      beforeEach('update lock manager', async () => {
        const manager = address || lockManager.address
        const receipt = await registry.updateLockManagerWhitelist(manager, allowed, { from: governor })

        assert.equal(await registry.isLockManagerWhitelisted(manager), allowed)
        assertAmountOfEvents(receipt, REGISTRY_EVENTS.LOCK_MANAGER_CHANGED)
        assertEvent(receipt, REGISTRY_EVENTS.LOCK_MANAGER_CHANGED, { expectedArgs: { lockManager: manager, allowed } })
      })
    }

    const itCreatesTheActivationLock = () => {
      it('creates the lock', async () => {
        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount, 'locked amount does not match')
        assertBn(total, lockAmount, 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })
        const receipt = await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED)
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { expectedArgs: { guardian, lockManager, amount: lockAmount.mul(bn(2)), total: lockAmount.mul(bn(2)) } })
      })

      it('can creates multiple locks', async () => {
        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })
        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })

        await registry.updateLockManagerWhitelist(anotherLockManager.address, true, { from: governor })
        await registry.lockActivation(anotherLockManager.address, lockAmount, { from: guardian })

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount.mul(bn(2)), 'locked amount does not match')
        assertBn(total, lockAmount.mul(bn(3)), 'total locked amount does not match')
      })

      it('does not allow to deactivate the locked amount for present active tokens', async () => {
        await activateTokens(lockAmount)

        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })

        await assertRevert(registry.deactivate(lockAmount, { from: guardian }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })

      it('does not allow to deactivate the locked amount for future active tokens', async () => {
        await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })

        await activateTokens(lockAmount)

        await assertRevert(registry.deactivate(lockAmount, { from: guardian }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })
    }

    context('when the given lock manager is allowed', async () => {
      allowLockManager(lockManager, true)

      context('when any lock manager is allowed', async () => {
        allowLockManager(ANY_ENTITY, true)
        itCreatesTheActivationLock()
      })

      context('when any lock manager is not allowed', async () => {
        allowLockManager(ANY_ENTITY, false)
        itCreatesTheActivationLock()
      })
    })

    context('when the given lock manager is not allowed', async () => {
      allowLockManager(lockManager, false)

      context('when any lock manager is allowed', async () => {
        allowLockManager(ANY_ENTITY, true)

        itCreatesTheActivationLock()
      })

      context('when any lock manager is not allowed', async () => {
        allowLockManager(ANY_ENTITY, false)

        it('reverts', async () => {
          await assertRevert(registry.lockActivation(lockManager.address, lockAmount, { from: guardian }), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
        })
      })
    })
  })

  describe('unlockActivation', () => {
    const lockAmount = bigExp(1000, 18)
    const unlockAmount = bigExp(100, 18)

    const itUnlocksTheActivation = (from) => {
      it('decreases the lock', async () => {
        await registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from })
        await registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from })

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount.sub(unlockAmount.mul(bn(2))), 'locked amount does not match')
        assertBn(total, lockAmount.sub(unlockAmount.mul(bn(2))), 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from })
        const receipt = await registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from })

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED)
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { expectedArgs: { guardian, lockManager, amount: lockAmount.sub(unlockAmount.mul(bn(2))), total: lockAmount.sub(unlockAmount.mul(bn(2))) } })
      })

      it('allows to deactivate the unlocked amount', async () => {
        await activateTokens(lockAmount)

        await registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from })

        const receipt = await registry.deactivate(unlockAmount, { from: guardian })
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
      })
    }

    context('when the sender is not the lock manager', () => {
      context('when the lock manager allows to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(true)
        })

        context('when there was a locked amount', () => {
          beforeEach('create lock', async () => {
            await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
            await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })
          })

          context('when the sender is the guardian', () => {
            const from = guardian

            itUnlocksTheActivation(from)

            it('can request a deactivation in the same call', async () => {
              await activateTokens(lockAmount)

              const receipt = await registry.unlockActivation(guardian, lockManager.address, unlockAmount, true, { from })

              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
            })
          })

          context('when the sender is not the guardian', () => {
            const from = someone

            itUnlocksTheActivation(from)

            it('can request a deactivation in the same call', async () => {
              await activateTokens(lockAmount)

              const receipt = await registry.unlockActivation(guardian, lockManager.address, unlockAmount, true, { from })

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { expectedAmount: 0 })
            })
          })
        })

        context('when there was no locked amount', () => {
          it('reverts', async () => {
            await assertRevert(registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from: guardian }), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
          })
        })
      })

      context('when the lock manager does not allow to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(false)
        })

        beforeEach('create lock', async () => {
          await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
          await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })
        })

        context('when the sender is the guardian', () => {
          const from = guardian

          it('reverts', async () => {
            await assertRevert(registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from }), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })

        context('when the sender is not the guardian', () => {
          const from = someone

          it('reverts', async () => {
            await assertRevert(registry.unlockActivation(guardian, lockManager.address, unlockAmount, false, { from }), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })
      })
    })

    context('when the sender is the lock manager', () => {
      context('when there was a locked amount', () => {
        beforeEach('create lock', async () => {
          await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
          await registry.lockActivation(lockManager.address, lockAmount, { from: guardian })
        })

        it('decreases the lock', async () => {
          await lockManager.unlock(guardian, unlockAmount)

          const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
          assertBn(amount, lockAmount.sub(unlockAmount), 'locked amount does not match')
          assertBn(total, lockAmount.sub(unlockAmount), 'total locked amount does not match')
        })

        it('emits an event', async () => {
          const receipt = await lockManager.unlock(guardian, unlockAmount)

          assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: GuardiansRegistry.abi })
          assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, lockManager, amount: lockAmount.sub(unlockAmount), total: lockAmount.sub(unlockAmount) } })
        })

        it('allows to deactivate the unlocked amount', async () => {
          await activateTokens(lockAmount)

          await lockManager.unlock(guardian, unlockAmount)

          const receipt = await registry.deactivate(unlockAmount, { from: guardian })
          assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
        })
      })

      context('when there was no locked amount', () => {
        it('reverts', async () => {
          await assertRevert(lockManager.unlock(guardian, unlockAmount), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
        })
      })
    })
  })
})
