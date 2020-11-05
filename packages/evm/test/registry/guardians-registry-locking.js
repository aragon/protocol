const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { roleId } = require('../helpers/utils/modules')
const { buildHelper } = require('../helpers/wrappers/protocol')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

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

  const activate = async (amount) => {
    await ANT.generateTokens(guardian, amount)
    await ANT.approve(registry.address, amount, { from: guardian })
    return registry.stakeAndActivate(guardian, amount, { from: guardian })
  }

  const lockActivation = async (lockManager, amount, sender = undefined) => {
    return sender
      ? registry.lockActivation(guardian, lockManager.address, amount, { from: sender })
      : lockManager.lockActivation(guardian, amount)
  }

  const unlockActivation = async (amount, sender = undefined, deactivate = false) => {
    return sender
      ? registry.unlockActivation(guardian, lockManager.address, amount, deactivate, { from: sender })
      : lockManager.unlock(guardian, amount)
  }

  describe('lockActivation', () => {
    const lockAmount = bigExp(1000, 18)

    const allowLockManager = (address, allowed) => {
      beforeEach('update lock manager', async () => {
        const manager = address || lockManager.address
        const id = roleId(registry, 'lockActivation')
        const fn = allowed ? 'grant' : 'revoke'
        await controller[fn](id, manager, { from: governor })
      })
    }

    const itCreatesTheActivationLock = (sender = undefined) => {
      it('creates the lock', async () => {
        await lockActivation(lockManager, lockAmount, sender)

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount, 'locked amount does not match')
        assertBn(total, lockAmount, 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await lockActivation(lockManager, lockAmount, sender)
        const receipt = await lockActivation(lockManager, lockAmount, sender)

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: registry.abi })
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: registry.abi, expectedArgs: { guardian, lockManager, amount: lockAmount.mul(bn(2)), total: lockAmount.mul(bn(2)) } })
      })

      it('can creates multiple locks', async () => {
        await lockActivation(lockManager, lockAmount, sender)
        await lockActivation(lockManager, lockAmount, sender)

        await controller.grant(roleId(registry, 'lockActivation'), anotherLockManager.address, { from: governor })
        await lockActivation(anotherLockManager, lockAmount, sender)

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount.mul(bn(2)), 'locked amount does not match')
        assertBn(total, lockAmount.mul(bn(3)), 'total locked amount does not match')
      })

      it('does not allow to deactivate the locked amount for present active tokens', async () => {
        await activate(lockAmount)

        await lockActivation(lockManager, lockAmount, sender)

        await assertRevert(registry.deactivate(guardian, lockAmount, { from: guardian }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })

      it('does not allow to deactivate the locked amount for future active tokens', async () => {
        await lockActivation(lockManager, lockAmount, sender)

        await activate(lockAmount)

        await assertRevert(registry.deactivate(guardian, lockAmount, { from: guardian }), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })
    }

    context('when the sender is the guardian', () => {
      const sender = guardian

      context('when the given lock manager is allowed', () => {
        allowLockManager(lockManager, true)

        itCreatesTheActivationLock(sender)
      })

      context('when the given lock manager is not allowed', () => {
        allowLockManager(lockManager, false)

        it('reverts', async () => {
          await assertRevert(lockActivation(lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
        })
      })
    })

    context('when the sender is not the guardian', () => {
      context('when the sender is a lock manager', () => {
        const sender = undefined // will use the lock manager

        context('when the given lock manager is allowed', () => {
          allowLockManager(lockManager, true)

          itCreatesTheActivationLock(sender)
        })

        context('when the given lock manager is not allowed', () => {
          allowLockManager(lockManager, false)

          it('reverts', async () => {
            await assertRevert(lockActivation(lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
          })
        })
      })

      context('when the sender is not a lock manager', () => {
        const sender = someone

        context('when the sender has permission', () => {
          beforeEach('grant role', async () => {
            await controller.grant(roleId(registry, 'lockActivation'), sender, { from: governor })
          })

          context('when the given lock manager is allowed', () => {
            allowLockManager(lockManager, true)

            itCreatesTheActivationLock(sender)
          })

          context('when the given lock manager is not allowed', () => {
            allowLockManager(lockManager, false)

            it('reverts', async () => {
              await assertRevert(lockActivation(lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
            })
          })
        })

        context('when the sender does not have permission', () => {
          beforeEach('revoke role', async () => {
            await controller.revoke(roleId(registry, 'lockActivation'), sender, { from: governor })
          })

          it('reverts', async () => {
            await assertRevert(lockActivation(lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
          })
        })
      })
    })
  })

  describe('unlockActivation', () => {
    const lockAmount = bigExp(1000, 18)
    const unlockAmount = bigExp(100, 18)

    const itUnlocksTheActivation = (sender) => {
      it('decreases the lock', async () => {
        await unlockActivation(unlockAmount, sender)
        await unlockActivation(unlockAmount, sender)

        const { amount, total } = await registry.getActivationLock(guardian, lockManager.address)
        assertBn(amount, lockAmount.sub(unlockAmount.mul(bn(2))), 'locked amount does not match')
        assertBn(total, lockAmount.sub(unlockAmount.mul(bn(2))), 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await unlockActivation(unlockAmount, sender)
        const receipt = await unlockActivation(unlockAmount, sender)

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED)
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { expectedArgs: { guardian, lockManager, amount: lockAmount.sub(unlockAmount.mul(bn(2))), total: lockAmount.sub(unlockAmount.mul(bn(2))) } })
      })

      it('allows to deactivate the unlocked amount', async () => {
        await activate(lockAmount)

        await unlockActivation(unlockAmount, sender)

        const receipt = await registry.deactivate(guardian, unlockAmount, { from: guardian })
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
      })
    }

    context('when the sender is not the lock manager', () => {
      context('when the lock manager allows to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(true)
        })

        context('when the sender is the guardian', () => {
          const sender = guardian

          context('when there was a locked amount', () => {
            beforeEach('create lock', async () => {
              await controller.grant(roleId(registry, 'lockActivation'), lockManager.address, { from: governor })
              await lockManager.lockActivation(guardian, lockAmount)
            })

            itUnlocksTheActivation(sender)

            it('can request a deactivation in the same call', async () => {
              await activate(lockAmount)

              const receipt = await unlockActivation(unlockAmount, sender, true)

              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
            })
          })

          context('when there was no locked amount', () => {
            it('reverts', async () => {
              await assertRevert(unlockActivation(unlockAmount, sender), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
            })
          })
        })

        context('when the sender is not the guardian', () => {
          const sender = someone

          context('when there was a locked amount', () => {
            beforeEach('create lock', async () => {
              await controller.grant(roleId(registry, 'lockActivation'), lockManager.address, { from: governor })
              await lockManager.lockActivation(guardian, lockAmount)
            })

            itUnlocksTheActivation(sender)

            context('when the sender has permission', () => {
              beforeEach('grant role', async () => {
                await controller.grant(roleId(registry, 'unlockActivation'), sender, { from: governor })
              })

              it('can request a deactivation in the same call', async () => {
                await activate(lockAmount)

                const receipt = await unlockActivation(unlockAmount, sender, true)

                assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian, amount: unlockAmount } })
              })
            })

            context('when the sender does not have permission', () => {
              beforeEach('revoke role', async () => {
                await controller.revoke(roleId(registry, 'unlockActivation'), sender, { from: governor })
              })

              it('cannot request a deactivation in the same call', async () => {
                await activate(lockAmount)

                await assertRevert(unlockActivation(unlockAmount, sender, true), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
              })
            })
          })

          context('when there was no locked amount', () => {
            it('reverts', async () => {
              await assertRevert(unlockActivation(unlockAmount, sender), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
            })
          })
        })
      })

      context('when the lock manager does not allow to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(false)
        })

        context('when the sender is the guardian', () => {
          const sender = guardian

          beforeEach('create lock', async () => {
            await controller.grant(roleId(registry, 'lockActivation'), lockManager.address, { from: governor })
            await lockManager.lockActivation(guardian, lockAmount)
          })

          it('reverts', async () => {
            await assertRevert(unlockActivation(unlockAmount, sender), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })

        context('when the sender is not the guardian', () => {
          const sender = someone

          beforeEach('create lock', async () => {
            await controller.grant(roleId(registry, 'lockActivation'), lockManager.address, { from: governor })
            await lockManager.lockActivation(guardian, lockAmount)
          })

          it('reverts', async () => {
            await assertRevert(unlockActivation(unlockAmount, sender), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })
      })
    })

    context('when the sender is the lock manager', () => {
      context('when there was a locked amount', () => {
        beforeEach('create lock', async () => {
          await controller.grant(roleId(registry, 'lockActivation'), lockManager.address, { from: governor })
          await lockManager.lockActivation(guardian, lockAmount)
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
          await activate(lockAmount)

          await lockManager.unlock(guardian, unlockAmount)

          const receipt = await registry.deactivate(guardian, unlockAmount, { from: guardian })
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
