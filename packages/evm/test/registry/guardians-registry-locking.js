const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { encodeAuthorization } = require('../helpers/utils/modules')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS, SIGNATURES_VALIDATOR_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const LockManager = artifacts.require('LockManagerMock')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, governor]) => {
  let controller, registry, ANT, lockManager, anotherLockManager

  const wallet = web3.eth.accounts.create('erc3009')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

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

  const lockActivation = async (recipient, lockManager, amount, sender = undefined, authorize = false) => {
    if (!sender) return lockManager.lockActivation(recipient, amount)
    let calldata = registry.contract.methods.lockActivation(recipient, lockManager.address, amount.toString()).encodeABI()
    if (authorize) calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
    return registry.sendTransaction({ from: sender, data: calldata })
  }

  const unlockActivation = async (recipient, amount, sender = undefined, deactivate = false, authorize = false) => {
    if (!sender) return lockManager.unlock(recipient, amount)
    let calldata = registry.contract.methods.unlockActivation(recipient, lockManager.address, amount.toString(), deactivate).encodeABI()
    if (authorize) calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
    return registry.sendTransaction({ from: sender, data: calldata })
  }

  const activate = async (recipient, amount, sender = guardian) => {
    await ANT.generateTokens(sender, amount)
    await ANT.approve(registry.address, amount, { from: sender })
    let calldata = registry.contract.methods.stakeAndActivate(recipient, amount.toString()).encodeABI()
    calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
    return registry.sendTransaction({ from: sender, data: calldata })
  }

  const deactivate = async (recipient, amount, sender = guardian) => {
    let calldata = registry.contract.methods.deactivate(recipient, amount.toString()).encodeABI()
    calldata = await encodeAuthorization(registry, recipient, externalAccountPK, calldata, sender)
    return registry.sendTransaction({ from: sender, data: calldata })
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

    const itCreatesTheActivationLock = (recipient, sender = undefined, authorize = false) => {
      it('creates the lock', async () => {
        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)

        const { amount, total } = await registry.getActivationLock(recipient, lockManager.address)
        assertBn(amount, lockAmount, 'locked amount does not match')
        assertBn(total, lockAmount, 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)
        const receipt = await lockActivation(recipient, lockManager, lockAmount, sender, authorize)

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: registry.abi })
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { decodeForAbi: registry.abi, expectedArgs: { guardian: recipient, lockManager, amount: lockAmount.mul(bn(2)), total: lockAmount.mul(bn(2)) } })
      })

      it('can creates multiple locks', async () => {
        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)
        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)

        await registry.updateLockManagerWhitelist(anotherLockManager.address, true, { from: governor })
        await lockActivation(recipient, anotherLockManager, lockAmount, sender, authorize)

        const { amount, total } = await registry.getActivationLock(recipient, lockManager.address)
        assertBn(amount, lockAmount.mul(bn(2)), 'locked amount does not match')
        assertBn(total, lockAmount.mul(bn(3)), 'total locked amount does not match')
      })

      it('does not allow to deactivate the locked amount for present active tokens', async () => {
        await activate(recipient, lockAmount, sender)

        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)

        await assertRevert(deactivate(recipient, lockAmount, sender), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })

      it('does not allow to deactivate the locked amount for future active tokens', async () => {
        await lockActivation(recipient, lockManager, lockAmount, sender, authorize)

        await activate(recipient, lockAmount, sender)

        await assertRevert(deactivate(recipient, lockAmount, sender), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
      })
    }

    context('when the sender is the recipient', () => {
      const sender = guardian
      const recipient = guardian

      context('when the given lock manager is allowed', () => {
        allowLockManager(lockManager, true)

        itCreatesTheActivationLock(recipient, sender)
      })

      context('when the given lock manager is not allowed', () => {
        allowLockManager(lockManager, false)

        it('reverts', async () => {
          await assertRevert(lockActivation(recipient, lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
        })
      })
    })

    context('when the sender is not the recipient', () => {
      const recipient = externalAccount

      context('when the sender is a lock manager', () => {
        const sender = undefined // will use the lock manager

        context('when the given lock manager is allowed', () => {
          allowLockManager(lockManager, true)

          itCreatesTheActivationLock(recipient, sender)
        })

        context('when the given lock manager is not allowed', () => {
          allowLockManager(lockManager, false)

          it('reverts', async () => {
            await assertRevert(lockActivation(recipient, lockManager, lockAmount, sender), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
          })
        })
      })

      context('when the sender is an EOA', () => {
        const sender = guardian

        context('when the sender is authorized by recipient', () => {
          const authorized = true

          context('when the given lock manager is allowed', () => {
            allowLockManager(lockManager, true)

            itCreatesTheActivationLock(recipient, sender, authorized)
          })

          context('when the given lock manager is not allowed', () => {
            allowLockManager(lockManager, false)

            it('reverts', async () => {
              await assertRevert(lockActivation(recipient, lockManager, lockAmount, sender, authorized), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
            })
          })
        })

        context('when the sender is not authorized by recipient', () => {
          const authorized = false

          it('reverts', async () => {
            await assertRevert(lockActivation(recipient, lockManager, lockAmount, sender, authorized), REGISTRY_ERRORS.LOCK_MANAGER_NOT_ALLOWED)
          })
        })
      })
    })
  })

  describe('unlockActivation', () => {
    const lockAmount = bigExp(1000, 18)
    const unlockAmount = bigExp(100, 18)

    const itUnlocksTheActivation = (recipient, sender) => {
      it('decreases the lock', async () => {
        await unlockActivation(recipient, unlockAmount, sender)
        await unlockActivation(recipient, unlockAmount, sender)

        const { amount, total } = await registry.getActivationLock(recipient, lockManager.address)
        assertBn(amount, lockAmount.sub(unlockAmount.mul(bn(2))), 'locked amount does not match')
        assertBn(total, lockAmount.sub(unlockAmount.mul(bn(2))), 'total locked amount does not match')
      })

      it('emits an event', async () => {
        await unlockActivation(recipient, unlockAmount, sender)
        const receipt = await unlockActivation(recipient, unlockAmount, sender)

        assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED)
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATION_LOCK_CHANGED, { expectedArgs: { guardian: recipient, lockManager, amount: lockAmount.sub(unlockAmount.mul(bn(2))), total: lockAmount.sub(unlockAmount.mul(bn(2))) } })
      })

      it('allows to deactivate the unlocked amount', async () => {
        await activate(recipient, lockAmount, sender)

        await unlockActivation(recipient, unlockAmount, sender)

        const receipt = await deactivate(recipient, unlockAmount, sender)
        assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian: recipient, amount: unlockAmount } })
      })
    }

    context('when the sender is not the lock manager', () => {
      context('when the lock manager allows to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(true)
        })

        context('when the sender is the recipient', () => {
          const sender = guardian
          const recipient = sender

          context('when there was a locked amount', () => {
            beforeEach('create lock', async () => {
              await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
              await lockManager.lockActivation(recipient, lockAmount)
            })

            itUnlocksTheActivation(recipient, sender)

            it('can request a deactivation in the same call', async () => {
              await activate(recipient, lockAmount, sender)

              const receipt = await unlockActivation(recipient, unlockAmount, sender, true)

              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian: recipient, amount: unlockAmount } })
            })
          })

          context('when there was no locked amount', () => {
            it('reverts', async () => {
              await assertRevert(unlockActivation(recipient, unlockAmount, sender), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
            })
          })
        })

        context('when the sender is not the recipient', () => {
          const sender = guardian
          const recipient = externalAccount

          context('when there was a locked amount', () => {
            beforeEach('create lock', async () => {
              await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
              await lockManager.lockActivation(recipient, lockAmount)
            })

            itUnlocksTheActivation(recipient, sender)

            context('when sender was authorized', () => {
              const authorized = true

              it('can request a deactivation in the same call', async () => {
                await activate(recipient, lockAmount, sender)

                const receipt = await unlockActivation(recipient, unlockAmount, sender, true, authorized)

                assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { decodeForAbi: GuardiansRegistry.abi, expectedArgs: { guardian: recipient, amount: unlockAmount } })
              })
            })

            context('when sender was not authorized', () => {
              const authorized = false

              it('cannot request a deactivation in the same call', async () => {
                await activate(recipient, lockAmount, sender)

                await assertRevert(unlockActivation(recipient, unlockAmount, sender, true, authorized), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
              })
            })
          })

          context('when there was no locked amount', () => {
            it('reverts', async () => {
              await assertRevert(unlockActivation(recipient, unlockAmount, sender), REGISTRY_ERRORS.ZERO_LOCK_ACTIVATION)
            })
          })
        })
      })

      context('when the lock manager does not allow to unlock', () => {
        beforeEach('mock can unlock', async () => {
          await lockManager.mockCanUnlock(false)
        })

        context('when the sender is the recipient', () => {
          const sender = guardian
          const recipient = guardian

          beforeEach('create lock', async () => {
            await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
            await lockManager.lockActivation(recipient, lockAmount)
          })

          it('reverts', async () => {
            await assertRevert(unlockActivation(recipient, unlockAmount, sender), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })

        context('when the sender is not the recipient', () => {
          const recipient = externalAccount
          const sender = guardian

          beforeEach('create lock', async () => {
            await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
            await lockManager.lockActivation(recipient, lockAmount)
          })

          it('reverts', async () => {
            await assertRevert(unlockActivation(recipient, unlockAmount, sender), REGISTRY_ERRORS.CANNOT_UNLOCK_ACTIVATION)
          })
        })
      })
    })

    context('when the sender is the lock manager', () => {
      context('when there was a locked amount', () => {
        beforeEach('create lock', async () => {
          await registry.updateLockManagerWhitelist(lockManager.address, true, { from: governor })
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
          await activate(guardian, lockAmount)

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
