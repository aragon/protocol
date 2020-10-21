const { ZERO_ADDRESS, bn } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertEvent, assertAmountOfEvents } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { PAYMENTS_BOOK_EVENTS } = require('../helpers/utils/events')
const { CONTROLLED_ERRORS, PAYMENTS_BOOK_ERRORS } = require('../helpers/utils/errors')

const PaymentsBook = artifacts.require('PaymentsBook')

contract('PaymentsBook', ([_, governor, someone]) => {
  let protocolHelper, controller

  const PERIOD_DURATION = 24 * 30           // 30 days, assuming terms are 1h
  const GOVERNOR_SHARE_PCT = bn(100)        // 100‱ = 1%

  before('create controller', async () => {
    protocolHelper = buildHelper()
    controller = await protocolHelper.deploy({ configGovernor: governor })
  })

  describe('constructor', () => {
    context('when the initialization succeeds', () => {
      it('initializes payments book correctly', async () => {
        const paymentsBook = await PaymentsBook.new(controller.address, PERIOD_DURATION, GOVERNOR_SHARE_PCT)

        assert.equal(await paymentsBook.getController(), controller.address, 'payments book controller does not match')
        assertBn(await paymentsBook.periodDuration(), PERIOD_DURATION, 'payment duration does not match')
        assertBn(await paymentsBook.governorSharePct(), GOVERNOR_SHARE_PCT, 'governor share pct does not match')
      })
    })

    context('initialization fails', () => {
      context('when the given controller is the zero address', () => {
        const controllerAddress = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(PaymentsBook.new(controllerAddress, PERIOD_DURATION, GOVERNOR_SHARE_PCT), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })

      context('when the given controller is not a contract address', () => {
        const controllerAddress = someone

        it('reverts', async () => {
          await assertRevert(PaymentsBook.new(controllerAddress, PERIOD_DURATION, GOVERNOR_SHARE_PCT), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })

      context('when the given period duration is zero', () => {
        const periodDuration = 0

        it('reverts', async () => {
          await assertRevert(PaymentsBook.new(controller.address, periodDuration, GOVERNOR_SHARE_PCT), PAYMENTS_BOOK_ERRORS.PERIOD_DURATION_ZERO)
        })
      })

      context('when the given governor share is above 100%', () => {
        const governorSharePct = bn(10001)

        it('reverts', async () => {
          await assertRevert(PaymentsBook.new(controller.address, PERIOD_DURATION, governorSharePct), PAYMENTS_BOOK_ERRORS.OVERRATED_GOVERNOR_SHARE_PCT)
        })
      })
    })
  })

  describe('setGovernorSharePct', () => {
    let paymentsBook

    beforeEach('create payments module', async () => {
      paymentsBook = protocolHelper.paymentsBook
    })

    context('when the sender is the governor', async () => {
      const from = governor

      const itUpdatesTheGovernorSharePct = newGovernorSharePct => {
        it('updates the governor share pct', async () => {
          await paymentsBook.setGovernorSharePct(newGovernorSharePct, { from })

          assertBn((await paymentsBook.governorSharePct()), newGovernorSharePct, 'governor share pct does not match')
        })

        it('emits an event', async () => {
          const previousGovernorSharePct = await paymentsBook.governorSharePct()

          const receipt = await paymentsBook.setGovernorSharePct(newGovernorSharePct, { from })

          assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_PCT_CHANGED)
          assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_PCT_CHANGED, { expectedArgs: { previousGovernorSharePct, currentGovernorSharePct: newGovernorSharePct } })
        })
      }

      context('when the given value is zero', async () => {
        const newGovernorSharePct = bn(0)

        itUpdatesTheGovernorSharePct(newGovernorSharePct)
      })

      context('when the given value is not greater than 10,000', async () => {
        const newGovernorSharePct = bn(500)

        itUpdatesTheGovernorSharePct(newGovernorSharePct)
      })

      context('when the given value is greater than 10,000', async () => {
        const newGovernorSharePct = bn(10001)

        it('reverts', async () => {
          await assertRevert(paymentsBook.setGovernorSharePct(newGovernorSharePct, { from }), PAYMENTS_BOOK_ERRORS.OVERRATED_GOVERNOR_SHARE_PCT)
        })
      })
    })

    context('when the sender is not the governor', async () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(paymentsBook.setGovernorSharePct(GOVERNOR_SHARE_PCT, { from }), CONTROLLED_ERRORS.SENDER_NOT_CONFIG_GOVERNOR)
      })
    })
  })
})
