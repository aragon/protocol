const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { REGISTRY_EVENTS } = require('../helpers/utils/events')
const { CONTROLLED_ERRORS, REGISTRY_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, governor, someone]) => {
  let controller, registry, ANT

  const MIN_ACTIVE_BALANCE = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor, minActiveBalance: MIN_ACTIVE_BALANCE })
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  beforeEach('create guardians registry module', async () => {
    registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(registry.address)
  })

  describe('setTotalActiveBalanceLimit', () => {
    context('when the sender is the governor', () => {
      const from = governor

      context('when the given limit is greater than zero', () => {
        const itUpdatesTheTotalActiveBalanceLimit = newTotalActiveBalanceLimit => {
          it('updates the current total active balance limit', async () => {
            await registry.setTotalActiveBalanceLimit(newTotalActiveBalanceLimit, { from })

            const currentTotalActiveBalanceLimit = await registry.totalActiveBalanceLimit()
            assertBn(currentTotalActiveBalanceLimit, newTotalActiveBalanceLimit, 'total active balance limit does not match')
          })

          it('emits an event', async () => {
            const previousTotalActiveBalanceLimit = await registry.totalActiveBalanceLimit()

            const receipt = await registry.setTotalActiveBalanceLimit(newTotalActiveBalanceLimit, { from })

            assertAmountOfEvents(receipt, REGISTRY_EVENTS.TOTAL_ACTIVE_BALANCE_LIMIT_CHANGED)
            assertEvent(receipt, REGISTRY_EVENTS.TOTAL_ACTIVE_BALANCE_LIMIT_CHANGED, { expectedArgs: { previousTotalActiveBalanceLimit, currentTotalActiveBalanceLimit: newTotalActiveBalanceLimit } })
          })
        }

        context('when the given limit is below the minimum active balance', () => {
          const newTotalActiveBalanceLimit = MIN_ACTIVE_BALANCE.sub(bn(1))

          itUpdatesTheTotalActiveBalanceLimit(newTotalActiveBalanceLimit)
        })

        context('when the given limit is above the minimum active balance', () => {
          const newTotalActiveBalanceLimit = MIN_ACTIVE_BALANCE.add(bn(1))

          itUpdatesTheTotalActiveBalanceLimit(newTotalActiveBalanceLimit)
        })
      })

      context('when the given limit is zero', () => {
        const newTotalActiveBalanceLimit = bn(0)

        it('reverts', async () => {
          await assertRevert(registry.setTotalActiveBalanceLimit(newTotalActiveBalanceLimit, { from }), REGISTRY_ERRORS.BAD_TOTAL_ACTIVE_BALANCE_LIMIT)
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(registry.setTotalActiveBalanceLimit(TOTAL_ACTIVE_BALANCE_LIMIT, { from }), CONTROLLED_ERRORS.SENDER_NOT_CONFIG_GOVERNOR)
      })
    })
  })
})
