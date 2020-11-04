const { keccak256 } = require('web3-utils')
const { ZERO_ADDRESS, bn, bigExp, getEventAt, decodeEvents } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { simulateDraft } = require('../helpers/utils/registry')
const { countEqualGuardians } = require('../helpers/utils/guardians')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { CONTROLLED_ERRORS, TREE_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistryMock')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, guardian500, guardian1000, guardian1500, guardian2000, guardian2500, guardian3000, guardian3500, guardian4000]) => {
  let controller, registry, disputeManager, ANT

  const DRAFT_LOCK_PCT = bn(2000) // 20%
  const MIN_ACTIVE_AMOUNT = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)
  const DRAFT_LOCKED_AMOUNT = MIN_ACTIVE_AMOUNT.mul(DRAFT_LOCK_PCT).div(bn(10000))

  /** These tests are using a fixed seed to make sure we generate the same output on each run */
  const TERM_ID = 1
  const DISPUTE_ID = 0
  const SORTITON_ITERATION = 0
  const EMPTY_RANDOMNESS = '0x0000000000000000000000000000000000000000000000000000000000000000'

  const balances = [
    bigExp(500,  18),
    bigExp(1000, 18),
    bigExp(1500, 18),
    bigExp(2000, 18),
    bigExp(2500, 18),
    bigExp(3000, 18),
    bigExp(3500, 18),
    bigExp(4000, 18)
  ]

  const guardians = [
    { address: guardian500,  initialActiveBalance: balances[0] },
    { address: guardian1000, initialActiveBalance: balances[1] },
    { address: guardian1500, initialActiveBalance: balances[2] },
    { address: guardian2000, initialActiveBalance: balances[3] },
    { address: guardian2500, initialActiveBalance: balances[4] },
    { address: guardian3000, initialActiveBalance: balances[5] },
    { address: guardian3500, initialActiveBalance: balances[6] },
    { address: guardian4000, initialActiveBalance: balances[7] }
  ]

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ minActiveBalance: MIN_ACTIVE_AMOUNT })

    ANT = await ERC20.new('ANT Token', 'ANT', 18)
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)

    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  describe('draft', () => {
    const getTreeKey = (balances, soughtBalance) => {
      // linear search on balances
      if (soughtBalance.eq(bn(0))) return undefined

      let key = 0
      let accumulated = bn(0)
      for (let balance of balances) {
        accumulated = accumulated.add(balance)
        if (soughtBalance.lt(accumulated)) break
        key++
      }
      return key
    }

    const computeExpectedGuardians = async ({
      termRandomness = EMPTY_RANDOMNESS,
      disputeId = DISPUTE_ID,
      selectedGuardians = 0,
      batchRequestedGuardians,
      roundRequestedGuardians
    }) => {
      for (const guardian of guardians) {
        guardian.unlockedActiveBalance = await registry.unlockedActiveBalanceOf(guardian.address)
        const { active } = await registry.balanceOfAt(guardian.address, TERM_ID)
        guardian.activeBalance = active
      }

      const activeGuardians = guardians.filter(guardian => guardian.activeBalance.gte(MIN_ACTIVE_AMOUNT))

      return simulateDraft({
        termRandomness,
        disputeId,
        selectedGuardians,
        batchRequestedGuardians,
        roundRequestedGuardians,
        sortitionIteration: SORTITON_ITERATION,
        balances,
        guardians: activeGuardians,
        draftLockAmount: DRAFT_LOCKED_AMOUNT,
        getTreeKey
      })
    }

    const draft = async ({
      termRandomness = EMPTY_RANDOMNESS,
      disputeId = DISPUTE_ID,
      selectedGuardians = 0,
      batchRequestedGuardians,
      roundRequestedGuardians
    }) => {
      const expectedGuardians = await computeExpectedGuardians({ termRandomness, disputeId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
      const receipt = await disputeManager.draft(termRandomness, disputeId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians, DRAFT_LOCK_PCT)
      const { addresses, length } = getEventAt(receipt, 'Drafted').args
      return { receipt, addresses, length, expectedGuardians }
    }

    const getFirstExpectedGuardianAddress = async ({ disputeId, batchRequestedGuardians, roundRequestedGuardians }) => {
      const expectedGuardians = await computeExpectedGuardians({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
      return expectedGuardians[0]
    }

    const deactivateFirstExpectedGuardian = async ({ disputeId = DISPUTE_ID, batchRequestedGuardians, roundRequestedGuardians }) => {
      const guardian = await getFirstExpectedGuardianAddress({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
      await registry.deactivate(guardian, 0, { from: guardian })
      const { active } = await registry.balanceOf(guardian)
      assertBn(active, 0, 'first expected guardian active balance does not match')
    }

    const lockFirstExpectedGuardian = async ({ disputeId, batchRequestedGuardians, roundRequestedGuardians, leftUnlockedAmount = bn(0) }) => {
      const guardian = await getFirstExpectedGuardianAddress({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
      await registry.mockLock(guardian, leftUnlockedAmount)
      const { active, locked } = await registry.balanceOfAt(guardian, TERM_ID)
      assertBn(locked, active.sub(leftUnlockedAmount), 'guardian locked balance does not match')
    }

    beforeEach('initialize registry and mint ANT for guardians', async () => {
      for (let i = 0; i < guardians.length; i++) {
        await ANT.generateTokens(guardians[i].address, guardians[i].initialActiveBalance)
      }
    })

    context('when the sender is the dispute manager', () => {
      const itReverts = (previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians) => {
        it('reverts', async () => {
          await assertRevert(draft({ selectedGuardians: previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians }), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
        })
      }

      const itReturnsEmptyValues = (batchRequestedGuardians, roundRequestedGuardians) => {
        it('returns empty values', async () => {
          const { length, addresses } = await draft({ batchRequestedGuardians, roundRequestedGuardians })

          assertBn(length, 0, 'output length does not match')

          const expectedAddresses = (batchRequestedGuardians === 0) ? [] : Array.from(new Array(addresses.length)).map(() => ZERO_ADDRESS)
          assert.deepEqual(addresses, expectedAddresses, 'guardians address do not match')
        })

        it('does not emit a guardian balance locked event', async () => {
          const { receipt } = await draft({ batchRequestedGuardians, roundRequestedGuardians })
          const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_BALANCE_LOCKED)

          assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_BALANCE_LOCKED, { expectedAmount: 0 })
        })
      }

      const itReturnsExpectedGuardians = ({ termRandomness = EMPTY_RANDOMNESS, disputeId = 0, previousSelectedGuardians = 0, batchRequestedGuardians, roundRequestedGuardians }) => {
        if (previousSelectedGuardians > 0) {
          const selectedGuardians = 0

          beforeEach('run previous batch', async () => {
            await draft({ termRandomness, disputeId, selectedGuardians, batchRequestedGuardians: previousSelectedGuardians, roundRequestedGuardians })
          })
        }

        it('returns the expected guardians', async () => {
          const { addresses, length, expectedGuardians } = await draft({
            termRandomness,
            disputeId,
            selectedGuardians: previousSelectedGuardians,
            batchRequestedGuardians,
            roundRequestedGuardians
          })

          assert.lengthOf(addresses, batchRequestedGuardians, 'guardians length does not match')
          assert.lengthOf(expectedGuardians, length.toString(), 'expected guardians length does not match')
          assert.deepEqual(addresses.slice(0, length), expectedGuardians, 'guardian addresses do not match')
        })

        it('emits a guardian balance locked event', async () => {
          const { receipt, length, expectedGuardians } = await draft({
            termRandomness,
            disputeId,
            selectedGuardians: previousSelectedGuardians,
            batchRequestedGuardians,
            roundRequestedGuardians
          })

          const logs = decodeEvents(receipt, GuardiansRegistry.abi, REGISTRY_EVENTS.GUARDIAN_BALANCE_LOCKED)
          assertAmountOfEvents({ logs }, REGISTRY_EVENTS.GUARDIAN_BALANCE_LOCKED, { expectedAmount: length })

          for (let i = 0; i < length; i++) {
            assertEvent({ logs }, REGISTRY_EVENTS.GUARDIAN_BALANCE_LOCKED, { guardian: expectedGuardians[i], amount: DRAFT_LOCKED_AMOUNT }, i)
          }
        })

        it('locks the corresponding amount of active balances for the expected guardians', async () => {
          const previousLockedBalances = {}
          for (let i = 0; i < guardians.length; i++) {
            const address = guardians[i].address
            const { locked } = await registry.balanceOf(address)
            previousLockedBalances[address] = locked
          }

          const { expectedGuardians } = await draft({
            termRandomness,
            disputeId,
            selectedGuardians: previousSelectedGuardians,
            batchRequestedGuardians,
            roundRequestedGuardians
          })
          const countedGuardians = countEqualGuardians(expectedGuardians)

          for (const guardian of countedGuardians) {
            const { locked: currentLockedBalance } = await registry.balanceOf(guardian.address)
            const previousLockedBalance = previousLockedBalances[guardian.address]
            const expectedLockedBalance = guardian.count * DRAFT_LOCKED_AMOUNT

            const actualLockedBalance = currentLockedBalance.sub(previousLockedBalance)
            assertBn(actualLockedBalance, expectedLockedBalance, `locked balance for guardian #${guardian.address} does not match`)
          }
        })

        const checkSettle = async (unlock) => {
          const previousTotalBalances = {}
          for (let i = 0; i < guardians.length; i++) {
            const address = guardians[i].address
            const balances = await registry.balanceOf(address)
            previousTotalBalances[address] = balances.available.add(balances.active).add(balances.locked).add(balances.pendingDeactivation)
          }

          const { expectedGuardians } = await draft({
            termRandomness,
            disputeId,
            selectedGuardians: previousSelectedGuardians,
            batchRequestedGuardians,
            roundRequestedGuardians
          })
          const countedGuardians = countEqualGuardians(expectedGuardians)

          // settle
          await controller.mockIncreaseTerm()
          const firstSelectedGuardian = countedGuardians[0]
          const settledGuardians = [firstSelectedGuardian.address]
          const rewardedGuardians = [unlock]
          const lockedAmount = bn(firstSelectedGuardian.count).mul(DRAFT_LOCKED_AMOUNT)
          const lockedAmounts = [lockedAmount]
          await disputeManager.slashOrUnlock(settledGuardians, lockedAmounts, rewardedGuardians)
          await controller.mockIncreaseTerm()

          const balances = await registry.balanceOf(firstSelectedGuardian.address)
          const currentTotalBalance = balances.available.add(balances.active).add(balances.locked).add(balances.pendingDeactivation)
          let expectedTotalBalance = previousTotalBalances[firstSelectedGuardian.address]
          if (!unlock) {
            expectedTotalBalance = expectedTotalBalance.sub(lockedAmount)
          }

          assertBn(currentTotalBalance, expectedTotalBalance, `locked balance for guardian #${firstSelectedGuardian.address} does not match`)
        }

        it('unlocks properly after settling', async () => {
          await checkSettle(true)
        })

        it('slashes properly after settling', async () => {
          await checkSettle(false)
        })
      }

      context('when there are no activated guardians', () => {
        context('when no guardians were requested', () => {
          const batchRequestedGuardians = 0
          const roundRequestedGuardians = 0

          itReturnsEmptyValues(batchRequestedGuardians, roundRequestedGuardians)
        })

        context('when some guardians were requested', () => {
          const roundRequestedGuardians = 10

          context('for the first batch', () => {
            const batchRequestedGuardians = 3
            const previousSelectedGuardians = 0

            itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
          })

          context('for the second batch', () => {
            const batchRequestedGuardians = 7
            const previousSelectedGuardians = 3

            itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
          })
        })
      })

      context('when there are some activated guardians', () => {
        context('when there is only one guardian activated', () => {
          beforeEach('activate', async () => {
            const amount = bigExp(500, 18)
            await ANT.approve(registry.address, amount, { from: guardian500 })
            await registry.stakeAndActivate(guardian500, amount, { from: guardian500 })
          })

          context('when no guardians were requested', () => {
            const batchRequestedGuardians = 0
            const roundRequestedGuardians = 0

            itReturnsEmptyValues(batchRequestedGuardians, roundRequestedGuardians)
          })

          context('when some guardians were requested', () => {
            const roundRequestedGuardians = 10

            context('when the guardian is activated for the following term', () => {
              context('for the first batch', () => {
                const batchRequestedGuardians = 3
                const previousSelectedGuardians = 0

                itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
              })

              context('for the second batch', () => {
                const batchRequestedGuardians = 7
                const previousSelectedGuardians = 3

                itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
              })
            })

            context('when the guardian is activated for the current term', () => {
              beforeEach('increment term', async () => {
                await controller.mockIncreaseTerm()
              })

              context('when guardian has enough unlocked balance to be drafted', () => {
                context('for the first batch', () => {
                  const batchRequestedGuardians = 3
                  const previousSelectedGuardians = 0

                  itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                })

                context('for the second batch', () => {
                  const batchRequestedGuardians = 7
                  const previousSelectedGuardians = 3

                  itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                })
              })

              context('when guardian has partially enough unlocked balance to be drafted', () => {
                const firstBatchRequestedGuardians = 3

                beforeEach('lock first expected guardian', async () => {
                  const leftUnlockedAmount = DRAFT_LOCKED_AMOUNT.mul(bn(2))
                  await lockFirstExpectedGuardian({ batchRequestedGuardians: firstBatchRequestedGuardians, roundRequestedGuardians, leftUnlockedAmount })
                })

                context('for the first batch', () => {
                  const batchRequestedGuardians = firstBatchRequestedGuardians

                  itReturnsExpectedGuardians({ batchRequestedGuardians, roundRequestedGuardians })
                })

                context('for the second batch', () => {
                  const batchRequestedGuardians = 7

                  beforeEach('run previous batch', async () => {
                    await draft({ batchRequestedGuardians: firstBatchRequestedGuardians, roundRequestedGuardians })
                  })

                  itReturnsEmptyValues(batchRequestedGuardians, roundRequestedGuardians)
                })
              })

              context('when guardian does not have enough unlocked balance to be drafted', () => {
                const batchRequestedGuardians = 1
                const roundRequestedGuardians = 1

                beforeEach('lock first expected guardian', async () => {
                  await lockFirstExpectedGuardian({ batchRequestedGuardians, roundRequestedGuardians })
                })

                itReturnsEmptyValues(batchRequestedGuardians, roundRequestedGuardians)
              })
            })
          })
        })

        context('when there are many guardians activated', () => {
          beforeEach('activate', async () => {
            for (let i = 0; i < guardians.length; i++) {
              await ANT.approve(registry.address, guardians[i].initialActiveBalance, { from: guardians[i].address })
              await registry.stakeAndActivate(guardians[i].address, guardians[i].initialActiveBalance, { from: guardians[i].address })
            }
          })

          context('when no guardians were requested', () => {
            const batchRequestedGuardians = 0
            const roundRequestedGuardians = 0

            itReturnsEmptyValues(batchRequestedGuardians, roundRequestedGuardians)
          })

          context('when some guardians were requested', () => {
            context('when there were requested less guardians than the active ones', () => {
              const roundRequestedGuardians = 5

              context('when the guardians are activated for the following term', () => {
                context('for the first batch', () => {
                  const batchRequestedGuardians = 1
                  const previousSelectedGuardians = 0

                  itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
                })

                context('for the second batch', () => {
                  const batchRequestedGuardians = 4
                  const previousSelectedGuardians = 1

                  itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
                })
              })

              context('when the guardians are activated for the current term', () => {
                beforeEach('increment term', async () => {
                  await controller.mockIncreaseTerm()
                })

                context('for the first batch', () => {
                  const batchRequestedGuardians = 1
                  const previousSelectedGuardians = 0

                  itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                })

                context('for the second batch', () => {
                  const batchRequestedGuardians = 4
                  const previousSelectedGuardians = 1

                  itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                })
              })
            })

            context('when there were requested more guardians than the active ones', () => {
              const roundRequestedGuardians = 10

              context('when the guardians are activated for the following term', () => {
                context('for the first batch', () => {
                  const batchRequestedGuardians = 3
                  const previousSelectedGuardians = 0

                  itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
                })

                context('for the second batch', () => {
                  const batchRequestedGuardians = 7
                  const previousSelectedGuardians = 3

                  itReverts(previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians)
                })
              })

              context('when the guardians are activated for the current term', () => {
                beforeEach('increment term', async () => {
                  await controller.mockIncreaseTerm()
                })

                context('when guardians have not been selected for other drafts', () => {
                  context('for the first batch', () => {
                    const batchRequestedGuardians = 3
                    const previousSelectedGuardians = 0

                    itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })

                    it('changes for different dispute ids', async () => {
                      const disputeId = 1
                      const expectedGuardians = await computeExpectedGuardians({ disputeId: DISPUTE_ID, batchRequestedGuardians, roundRequestedGuardians })

                      const { addresses } = await draft({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
                      assert.notDeepEqual(addresses, expectedGuardians, 'guardians should not match')
                    })

                    it('changes for different term randomness', async () => {
                      const termRandomness = keccak256('0x1')
                      const expectedGuardians = await computeExpectedGuardians({ termRandomness: EMPTY_RANDOMNESS, batchRequestedGuardians, roundRequestedGuardians })

                      const { addresses } = await draft({ termRandomness, batchRequestedGuardians, roundRequestedGuardians })
                      assert.notDeepEqual(addresses, expectedGuardians, 'guardians should not match')
                    })
                  })

                  context('for the second batch', () => {
                    const batchRequestedGuardians = 7
                    const previousSelectedGuardians = 3

                    itReturnsExpectedGuardians({ previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                  })
                })

                context('when guardians have been selected for other drafts', () => {
                  const disputeId = DISPUTE_ID + 1

                  context('when all guardians have been enough balance to be drafted again', () => {
                    beforeEach('compute a previous draft', async () => {
                      await draft({ batchRequestedGuardians: 3, roundRequestedGuardians: 3 })
                    })

                    context('when guardians do not have deactivation requests', () => {
                      context('for the first batch', () => {
                        const batchRequestedGuardians = 3
                        const previousSelectedGuardians = 0

                        itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                      })

                      context('for the second batch', () => {
                        const batchRequestedGuardians = 7
                        const previousSelectedGuardians = 3

                        itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                      })
                    })

                    context('when some guardians have deactivation requests', () => {
                      context('for the first batch', () => {
                        const batchRequestedGuardians = 3
                        const previousSelectedGuardians = 0

                        beforeEach('deactivate first expected guardian', async () => {
                          await deactivateFirstExpectedGuardian({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
                        })

                        itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                      })

                      context('for the second batch', () => {
                        const batchRequestedGuardians = 7
                        const previousSelectedGuardians = 3

                        beforeEach('deactivate first expected guardian', async () => {
                          await deactivateFirstExpectedGuardian({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
                        })

                        itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                      })
                    })
                  })

                  context('when some guardians do not have been enough balance to be drafted again', () => {
                    context('for the first batch', () => {
                      const batchRequestedGuardians = 3
                      const previousSelectedGuardians = 0

                      beforeEach('lock first expected guardian', async () => {
                        await lockFirstExpectedGuardian({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
                      })

                      itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                    })

                    context('for the second batch', () => {
                      const batchRequestedGuardians = 7
                      const previousSelectedGuardians = 3

                      beforeEach('lock first expected guardian', async () => {
                        await lockFirstExpectedGuardian({ disputeId, batchRequestedGuardians, roundRequestedGuardians })
                      })

                      itReturnsExpectedGuardians({ disputeId, previousSelectedGuardians, batchRequestedGuardians, roundRequestedGuardians })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })

    context('when the sender is not the dispute manager', () => {
      it('reverts', async () => {
        await assertRevert(registry.draft([0, 0, 0, 0, 0, 0, 0]), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_DISPUTE_MANAGER)
      })
    })
  })
})
