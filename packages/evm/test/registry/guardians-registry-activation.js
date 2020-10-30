const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { REGISTRY_ERRORS, SIGNATURES_VALIDATOR_ERRORS } = require('../helpers/utils/errors')
const { encodeAuthorization } = require('../helpers/utils/modules')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian, governor]) => {
  let controller, registry, disputeManager, ANT

  const wallet = web3.eth.accounts.create('registry')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

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

  const unstake = async (recipient, amount, sender, authorize = false) => {
    let calldata = registry.contract.methods.unstake(recipient, amount.toString(), '0x').encodeABI()
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

  describe('stakeAndActivate', () => {
    const data = '0xabcd'

    const stakeAndActivate = async (guardian, amount, sender, authorize = false) => {
      let calldata = registry.contract.methods.stakeAndActivate(guardian, amount.toString(), data).encodeABI()
      if (authorize) calldata = await encodeAuthorization(registry, guardian, externalAccountPK, calldata, sender)
      return registry.sendTransaction({ from: sender, data: calldata })
    }

    const itHandlesStakeAndActivateProperly = (recipient, sender, authorize = false) => {
      context('when the given amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(stakeAndActivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
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
            await assertRevert(stakeAndActivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
          })
        })

        context('when the sender does not have enough token balance', () => {
          it('reverts', async () => {
            await assertRevert(stakeAndActivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
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

          it('adds the staked amount to the active balance of the recipient', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

            await stakeAndActivate(recipient, amount, sender, authorize)

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)
            assertBn(previousActiveBalance.add(amount), currentActiveBalance, 'recipient active balances do not match')

            assertBn(previousLockedBalance, currentLockedBalance, 'recipient locked balances do not match')
            assertBn(previousAvailableBalance, currentAvailableBalance, 'recipient available balances do not match')
            assertBn(previousDeactivationBalance, currentDeactivationBalance, 'recipient deactivation balances do not match')
          })

          it('does not affect the active balance of the current term', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

            await stakeAndActivate(recipient, amount, sender, authorize)

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          if (recipient !== sender) {
            it('does not affect the sender balances', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(sender)

              await stakeAndActivate(recipient, amount, sender, authorize)

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(sender)
              assertBn(previousActiveBalance, currentActiveBalance, 'sender active balances do not match')
              assertBn(previousLockedBalance, currentLockedBalance, 'sender locked balances do not match')
              assertBn(previousAvailableBalance, currentAvailableBalance, 'sender available balances do not match')
              assertBn(previousDeactivationBalance, currentDeactivationBalance, 'deactivation balances do not match')
            })
          }

          it('updates the unlocked balance of the recipient', async () => {
            const previousSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
            const previousRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

            await stakeAndActivate(recipient, amount, sender, authorize)

            await controller.mockIncreaseTerm()
            const currentRecipientUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
            assertBn(previousRecipientUnlockedActiveBalance.add(amount), currentRecipientUnlockedActiveBalance, 'recipient unlocked balances do not match')

            if (recipient !== sender) {
              const currentSenderUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(sender)
              assertBn(previousSenderUnlockedActiveBalance, currentSenderUnlockedActiveBalance, 'sender unlocked balances do not match')
            }
          })

          it('updates the total staked for the recipient', async () => {
            const previousSenderTotalStake = await registry.totalStakedFor(sender)
            const previousRecipientTotalStake = await registry.totalStakedFor(recipient)

            await stakeAndActivate(recipient, amount, sender, authorize)

            const currentRecipientTotalStake = await registry.totalStakedFor(recipient)
            assertBn(previousRecipientTotalStake.add(amount), currentRecipientTotalStake, 'recipient total stake amounts do not match')

            if (recipient !== sender) {
              const currentSenderTotalStake = await registry.totalStakedFor(sender)
              assertBn(previousSenderTotalStake, currentSenderTotalStake, 'sender total stake amounts do not match')
            }
          })

          it('updates the total staked', async () => {
            const previousTotalStake = await registry.totalStaked()

            await stakeAndActivate(recipient, amount, sender, authorize)

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake.add(amount), currentTotalStake, 'total stake amounts do not match')
          })

          it('transfers the tokens to the registry', async () => {
            const previousSenderBalance = await ANT.balanceOf(sender)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)
            const previousRecipientBalance = await ANT.balanceOf(recipient)

            await stakeAndActivate(recipient, amount, sender, authorize)

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

            const receipt = await stakeAndActivate(recipient, amount, sender, authorize)

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.STAKED)
            assertEvent(receipt, REGISTRY_EVENTS.STAKED, { expectedArgs: { user: recipient, amount, total: previousTotalStake.add(amount), data } })
          })

          it('emits an activation event', async () => {
            const termId = await controller.getCurrentTermId()

            const receipt = await stakeAndActivate(recipient, amount, sender, authorize)

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
            assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian: recipient, fromTermId: termId.add(bn(1)), amount, sender: sender } })
          })
        })

        context('when the sender does not have enough token balance', () => {
          it('reverts', async () => {
            await assertRevert(stakeAndActivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.TOKEN_TRANSFER_FAILED)
          })
        })
      })
    }

    context('when the sender is the recipient', () => {
      const sender = guardian
      const recipient = guardian

      itHandlesStakeAndActivateProperly(recipient, sender)
    })

    context('when the sender is not the recipient', () => {
      const sender = guardian
      const recipient = externalAccount

      context('when the sender is allowed as activator', () => {
        beforeEach('allow sender as activator', async () => {
          const receipt = await registry.updateActivatorWhitelist(sender, true, { from: governor })

          assert.equal(await registry.isActivatorWhitelisted(sender), true)
          assertAmountOfEvents(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED)
          assertEvent(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED, { expectedArgs: { activator: sender, allowed: true } })
        })

        context('when the sender is authorized by recipient', () => {
          const authorized = true

          itHandlesStakeAndActivateProperly(recipient, sender, authorized)
        })

        context('when the sender is not authorized by recipient', () => {
          const authorized = false

          itHandlesStakeAndActivateProperly(recipient, sender, authorized)
        })
      })

      context('when the sender is not allowed as activator', () => {
        beforeEach('disallow sender as activator', async () => {
          const receipt = await registry.updateActivatorWhitelist(sender, false, { from: governor })

          assert.equal(await registry.isActivatorWhitelisted(sender), false)
          assertAmountOfEvents(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED)
          assertEvent(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED, { expectedArgs: { activator: sender, allowed: false } })
        })

        context('when the sender is authorized by recipient', () => {
          const authorized = true

          itHandlesStakeAndActivateProperly(recipient, sender, authorized)
        })

        context('when the sender is not authorized by recipient', () => {
          const authorized = false

          it('reverts', async () => {
            await assertRevert(stakeAndActivate(recipient, MIN_ACTIVE_AMOUNT, sender, authorized), REGISTRY_ERRORS.ACTIVATOR_NOT_ALLOWED)
          })
        })
      })
    })
  })

  describe('activate', () => {
    const itHandlesActivationsProperly = (recipient, sender, authorize = false) => {
      context('when the recipient has not staked some tokens yet', () => {
        context('when the given amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the given amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
          })
        })

        context('when the given amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
          })
        })
      })

      context('when the recipient has already staked some tokens', () => {
        const maxPossibleBalance = TOTAL_ACTIVE_BALANCE_LIMIT

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, maxPossibleBalance)
          await ANT.approve(registry.address, maxPossibleBalance, { from: sender })
          await registry.stake(recipient, maxPossibleBalance, '0x', { from: sender })
        })

        const itHandlesActivationProperlyFor = ({ requestedAmount, deactivationAmount = bn(0), deactivationDue = true }) => {
          it('adds the requested amount to the active balance of the recipient and removes it from the available balance', async () => {
            const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

            await activate(recipient, requestedAmount, sender, authorize)

            const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)

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
            const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

            await activate(recipient, requestedAmount, sender, authorize)

            const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
            assertBn(currentTermPreviousBalance, currentTermCurrentBalance, 'current term active balances do not match')
          })

          it('increments the unlocked balance of the recipient', async () => {
            const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

            const { available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

            await activate(recipient, requestedAmount, sender, authorize)

            await controller.mockIncreaseTerm()
            const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
            const activationAmount = requestedAmount.eq(bn(0))
              ? (deactivationDue ? previousAvailableBalance.add(previousDeactivationBalance) : previousAvailableBalance)
              : requestedAmount
            assertBn(previousUnlockedActiveBalance.add(activationAmount), currentUnlockedActiveBalance, 'unlocked balances do not match')
          })

          it('does not affect the staked balances', async () => {
            const previousTotalStake = await registry.totalStaked()
            const previousRecipientStake = await registry.totalStakedFor(recipient)

            await activate(recipient, requestedAmount, sender, authorize)

            const currentTotalStake = await registry.totalStaked()
            assertBn(previousTotalStake, currentTotalStake, 'total stake amounts do not match')

            const currentRecipientStake = await registry.totalStakedFor(recipient)
            assertBn(previousRecipientStake, currentRecipientStake, 'recipient stake amounts do not match')
          })

          it('does not affect the token balances', async () => {
            const previousRecipientBalance = await ANT.balanceOf(sender)
            const previousRegistryBalance = await ANT.balanceOf(registry.address)

            await activate(recipient, requestedAmount, sender, authorize)

            const currentSenderBalance = await ANT.balanceOf(sender)
            assertBn(previousRecipientBalance, currentSenderBalance, 'sender balances do not match')

            const currentRegistryBalance = await ANT.balanceOf(registry.address)
            assertBn(previousRegistryBalance, currentRegistryBalance, 'registry balances do not match')
          })

          it('emits an activation event', async () => {
            const termId = await controller.getLastEnsuredTermId()
            const { available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

            const receipt = await activate(recipient, requestedAmount, sender, authorize)

            const activationAmount = requestedAmount.eq(bn(0))
              ? (deactivationDue ? previousAvailableBalance.add(previousDeactivationBalance) : previousAvailableBalance)
              : requestedAmount
            assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED)
            assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_ACTIVATED, { expectedArgs: { guardian: recipient, fromTermId: termId.add(bn(1)), amount: activationAmount, sender } })
          })

          if (deactivationAmount.gt(bn(0))) {
            it('emits a deactivation processed event', async () => {
              const termId = await controller.getCurrentTermId()
              const { availableTermId } = await registry.getDeactivationRequest(recipient)

              const receipt = await activate(recipient, requestedAmount, sender, authorize)

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian: recipient, amount: deactivationAmount, availableTermId, processedTermId: termId } })
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
                  await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
                })
              })

              context('when the future active amount will be lower than the minimum active value', () => {
                const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

                it('reverts', async () => {
                  await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
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
                await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
              })
            })

            context('when the future active amount will be lower than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

              it('reverts', async () => {
                await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
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
                await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ACTIVATION_AMOUNT)
              })
            })

            context('when the future active amount will be lower than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

              it('reverts', async () => {
                await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
              })
            })

            context('when the future active amount will be greater than the minimum active value', () => {
              const amount = MIN_ACTIVE_AMOUNT

              itHandlesActivationProperlyFor({ requestedAmount: amount, deactivationAmount })
            })
          })
        }

        context('when the recipient did not activate any tokens yet', () => {
          const itCreatesAnIdForTheGuardian = amount => {
            it('creates an id for the given recipient', async () => {
              await activate(recipient, amount, sender, authorize)

              const guardianId = await registry.getGuardianId(recipient)
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
              await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
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
              await registry.stake(recipient, 1, '0x', { from: sender })

              await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.TOTAL_ACTIVE_BALANCE_EXCEEDED)
            })
          })
        })

        context('when the recipient has already activated some tokens', () => {
          const activeBalance = MIN_ACTIVE_AMOUNT

          beforeEach('activate some tokens', async () => {
            await activate(recipient, activeBalance, sender, true)
          })

          context('when the recipient does not have a deactivation request', () => {
            context('when the given amount is zero', () => {
              const amount = bn(0)

              context('when the recipient was not slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('increase term', async () => {
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the recipient was slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('slash recipient', async () => {
                  await disputeManager.collect(recipient, bigExp(1, 18))
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the recipient was slashed and does not reach the minimum active amount of tokens', () => {
                beforeEach('slash recipient', async () => {
                  await disputeManager.collect(recipient, activeBalance)
                  await unstake(recipient, maxPossibleBalance.sub(activeBalance).sub(bn(1)), sender, true)
                })

                it('reverts', async () => {
                  await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
                })
              })
            })

            context('when the given amount is greater than zero', () => {
              const amount = bigExp(2, 18)

              context('when the recipient was not slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('increase term', async () => {
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the recipient was slashed and reaches the minimum active amount of tokens', () => {
                beforeEach('slash recipient', async () => {
                  await disputeManager.collect(recipient, amount)
                  await controller.mockIncreaseTerm()
                })

                itHandlesActivationProperlyFor({ requestedAmount: amount })
              })

              context('when the recipient was slashed and does not reach the minimum active amount of tokens', () => {
                beforeEach('slash recipient', async () => {
                  await disputeManager.collect(recipient, activeBalance)
                })

                it('reverts', async () => {
                  await assertRevert(activate(recipient, amount, sender, authorize), REGISTRY_ERRORS.ACTIVE_BALANCE_BELOW_MIN)
                })
              })
            })
          })

          context('when the recipient has a full deactivation request', () => {
            beforeEach('deactivate tokens', async () => {
              await deactivate(recipient, activeBalance, sender, true)
            })

            itHandlesDeactivationRequests(activeBalance)
          })
        })

        context('when the recipient has already activated all tokens', () => {
          const activeBalance = maxPossibleBalance

          beforeEach('activate tokens and deactivate', async () => {
            await activate(recipient, activeBalance, sender, true)
            await deactivate(recipient, activeBalance, sender, true)
          })

          itHandlesDeactivationRequests(activeBalance)
        })
      })
    }

    context('when the sender is the recipient', () => {
      const sender = guardian
      const recipient = guardian

      itHandlesActivationsProperly(recipient, sender)
    })

    context('when the sender is not the recipient', () => {
      const sender = guardian
      const recipient = externalAccount

      context('when the sender is allowed as activator', () => {
        beforeEach('allow sender as activator', async () => {
          const receipt = await registry.updateActivatorWhitelist(sender, true, { from: governor })

          assert.equal(await registry.isActivatorWhitelisted(sender), true)
          assertAmountOfEvents(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED)
          assertEvent(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED, { expectedArgs: { activator: sender, allowed: true } })
        })

        context('when the sender is authorized by recipient', () => {
          const authorize = true

          itHandlesActivationsProperly(recipient, sender, authorize)
        })

        context('when the sender is not authorized by recipient', () => {
          const authorized = false

          it('reverts', async () => {
            await assertRevert(activate(recipient, MIN_ACTIVE_AMOUNT, sender, authorized), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
          })
        })
      })

      context('when the sender is not allowed as activator', () => {
        beforeEach('disallow sender as activator', async () => {
          const receipt = await registry.updateActivatorWhitelist(sender, false, { from: governor })

          assert.equal(await registry.isActivatorWhitelisted(sender), false)
          assertAmountOfEvents(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED)
          assertEvent(receipt, REGISTRY_EVENTS.ACTIVATOR_CHANGED, { expectedArgs: { activator: sender, allowed: false } })
        })

        context('when the sender is authorized by recipient', () => {
          const authorized = true

          itHandlesActivationsProperly(recipient, sender, authorized)
        })

        context('when the sender is not authorized by recipient', () => {
          const authorized = false

          it('reverts', async () => {
            await assertRevert(activate(recipient, MIN_ACTIVE_AMOUNT, sender, authorized), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
          })
        })
      })
    })
  })

  describe('deactivate',  () => {
    const itHandlesDeactivationsProperly = (recipient, sender, authorize = false) => {
      const itRevertsForDifferentAmounts = () => {
        context('when the requested amount is zero', () => {
          const amount = bn(0)

          it('reverts', async () => {
            await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_ZERO_AMOUNT)
          })
        })

        context('when the requested amount is lower than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.sub(bn(1))

          it('reverts', async () => {
            await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
          })
        })

        context('when the requested amount is greater than the minimum active value', () => {
          const amount = MIN_ACTIVE_AMOUNT.mul(bn(2))

          it('reverts', async () => {
            await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
          })
        })
      }

      context('when the recipient has not staked some tokens yet', () => {
        itRevertsForDifferentAmounts()
      })

      context('when the recipient has already staked some tokens', () => {
        const stakedBalance = MIN_ACTIVE_AMOUNT.mul(bn(5))

        beforeEach('stake some tokens', async () => {
          await ANT.generateTokens(sender, stakedBalance)
          await ANT.approve(registry.address, stakedBalance, { from: sender })
          await registry.stake(recipient, stakedBalance, '0x', { from: sender })
        })

        context('when the recipient did not activate any tokens yet', () => {
          itRevertsForDifferentAmounts()
        })

        context('when the recipient has already activated some tokens', () => {
          const activeBalance = MIN_ACTIVE_AMOUNT.mul(bn(4))

          beforeEach('activate some tokens', async () => {
            await activate(recipient, activeBalance, sender, true)
          })

          const itHandlesDeactivationRequestFor = (requestedAmount, expectedAmount = requestedAmount, previousDeactivationAmount = bn(0)) => {
            it('decreases the active balance and increases the deactivation balance of the recipient', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, locked: previousLockedBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

              await deactivate(recipient, requestedAmount, sender, authorize)

              const { active: currentActiveBalance, available: currentAvailableBalance, locked: currentLockedBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)

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
              const currentTermPreviousBalance = await registry.activeBalanceOfAt(recipient, termId)

              await deactivate(recipient, requestedAmount, sender, authorize)

              const currentTermCurrentBalance = await registry.activeBalanceOfAt(recipient, termId)
              assertBn(currentTermCurrentBalance, currentTermPreviousBalance, 'current term active balances do not match')
            })

            it('decreases the unlocked balance of the recipient', async () => {
              await controller.mockIncreaseTerm()
              const previousUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)

              await deactivate(recipient, requestedAmount, sender, authorize)

              await controller.mockIncreaseTerm()
              const currentUnlockedActiveBalance = await registry.unlockedActiveBalanceOf(recipient)
              assertBn(currentUnlockedActiveBalance, previousUnlockedActiveBalance.sub(expectedAmount), 'unlocked balances do not match')
            })

            it('does not affect the staked balance of the recipient', async () => {
              const previousTotalStake = await registry.totalStaked()
              const previousRecipientStake = await registry.totalStakedFor(recipient)

              await deactivate(recipient, requestedAmount, sender, authorize)

              const currentTotalStake = await registry.totalStaked()
              assertBn(currentTotalStake, previousTotalStake, 'total stake amounts do not match')

              const currentRecipientStake = await registry.totalStakedFor(recipient)
              assertBn(currentRecipientStake, previousRecipientStake, 'recipient stake amounts do not match')
            })

            it('does not affect the token balances', async () => {
              const previousRecipientBalance = await ANT.balanceOf(sender)
              const previousRegistryBalance = await ANT.balanceOf(registry.address)

              await deactivate(recipient, requestedAmount, sender, authorize)

              const currentSenderBalance = await ANT.balanceOf(sender)
              assertBn(currentSenderBalance, previousRecipientBalance, 'recipient balances do not match')

              const currentRegistryBalance = await ANT.balanceOf(registry.address)
              assertBn(currentRegistryBalance, previousRegistryBalance, 'registry balances do not match')
            })

            it('emits a deactivation request created event', async () => {
              const termId = await controller.getLastEnsuredTermId()
              const receipt = await deactivate(recipient, requestedAmount, sender, authorize)

              assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED)
              assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_REQUESTED, { expectedArgs: { guardian: recipient, availableTermId: termId.add(bn(1)), amount: expectedAmount } })
            })

            it('can be requested at the next term', async () => {
              const { active: previousActiveBalance, available: previousAvailableBalance, pendingDeactivation: previousDeactivationBalance } = await registry.balanceOf(recipient)

              await deactivate(recipient, requestedAmount, sender, authorize)
              await controller.mockIncreaseTerm()
              await registry.processDeactivationRequest(recipient)

              const { active: currentActiveBalance, available: currentAvailableBalance, pendingDeactivation: currentDeactivationBalance } = await registry.balanceOf(recipient)

              const expectedActiveBalance = previousActiveBalance.sub(expectedAmount)
              assertBn(currentActiveBalance, expectedActiveBalance, 'active balances do not match')

              const expectedAvailableBalance = previousAvailableBalance.add(previousDeactivationBalance).add(expectedAmount)
              assertBn(currentAvailableBalance, expectedAvailableBalance, 'available balances do not match')

              assertBn(currentDeactivationBalance, 0, 'deactivation balances do not match')
            })

            if (previousDeactivationAmount.gt(bn(0))) {
              it('emits a deactivation processed event', async () => {
                const termId = await controller.getCurrentTermId()
                const { availableTermId } = await registry.getDeactivationRequest(recipient)

                const receipt = await deactivate(recipient, requestedAmount, sender, authorize)

                assertAmountOfEvents(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED)
                assertEvent(receipt, REGISTRY_EVENTS.GUARDIAN_DEACTIVATION_PROCESSED, { expectedArgs: { guardian: recipient, amount: previousDeactivationAmount, availableTermId, processedTermId: termId } })
              })
            }
          }

          context('when the recipient does not have a deactivation request', () => {
            context('when the requested amount is zero', () => {
              const amount = bn(0)

              itHandlesDeactivationRequestFor(amount, activeBalance)
            })

            context('when the requested amount will make the active balance to be below the minimum active value', () => {
              const amount = activeBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

              it('reverts', async () => {
                await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
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

          context('when the recipient already has a previous deactivation request', () => {
            const previousDeactivationAmount = MIN_ACTIVE_AMOUNT
            const currentActiveBalance = activeBalance.sub(previousDeactivationAmount)

            beforeEach('deactivate tokens', async () => {
              await deactivate(recipient, previousDeactivationAmount, sender, true)
            })

            context('when the deactivation request is for the next term', () => {
              context('when the requested amount is zero', () => {
                const amount = bn(0)

                itHandlesDeactivationRequestFor(amount, currentActiveBalance)
              })

              context('when the requested amount will make the active balance to be below the minimum active value', () => {
                const amount = currentActiveBalance.sub(MIN_ACTIVE_AMOUNT).add(bn(1))

                it('reverts', async () => {
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
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

              context('when the recipient has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await registry.updateLockManagerWhitelist(sender, true, { from: governor })
                  await registry.lockActivation(recipient, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
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
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
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

              context('when the recipient has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await registry.updateLockManagerWhitelist(sender, true, { from: governor })
                  await registry.lockActivation(recipient, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
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
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.INVALID_DEACTIVATION_AMOUNT)
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

              context('when the recipient has an activation lock', () => {
                const amount = currentActiveBalance

                beforeEach('create activation lock', async () => {
                  await registry.updateLockManagerWhitelist(sender, true, { from: governor })
                  await registry.lockActivation(recipient, sender, amount, { from: sender })
                })

                it('reverts', async () => {
                  await assertRevert(deactivate(recipient, amount, sender, authorize), REGISTRY_ERRORS.DEACTIVATION_AMOUNT_EXCEEDS_LOCK)
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

      itHandlesDeactivationsProperly(recipient, sender)
    })

    context('when the sender is not the recipient', () => {
      const sender = guardian
      const recipient = externalAccount

      context('when the sender is authorized by recipient', () => {
        const authorize = true

        itHandlesDeactivationsProperly(recipient, sender, authorize)
      })

      context('when the sender is not authorized by recipient', () => {
        const authorized = false

        it('reverts', async () => {
          await assertRevert(deactivate(recipient, MIN_ACTIVE_AMOUNT, sender, authorized), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
        })
      })
    })
  })
})
