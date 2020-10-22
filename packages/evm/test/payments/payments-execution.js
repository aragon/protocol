const { bn, bigExp, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertEvent, assertAmountOfEvents } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { PAYMENTS_BOOK_ERRORS } = require('../helpers/utils/errors')
const { PAYMENTS_BOOK_EVENTS } = require('../helpers/utils/events')

const ERC20 = artifacts.require('ERC20Mock')

contract('PaymentBook', ([_, someone, payer]) => {
  let controller, paymentsBook, eth, token

  const PCT_BASE = bn(10000)
  const PERIOD_DURATION = 24 * 30           // 30 days, assuming terms are 1h
  const GOVERNOR_SHARE_PCT = bn(100)        // 100‱ = 1%

  before('deploy some tokens', async () => {
    eth = { address: ZERO_ADDRESS }
    token = await ERC20.new('Some Token', 'FOO', 18)
  })

  beforeEach('create payments book module', async () => {
    const protocolHelper = buildHelper()
    controller = await protocolHelper.deploy({ paymentPeriodDuration: PERIOD_DURATION, paymentsGovernorSharePct: GOVERNOR_SHARE_PCT })
    paymentsBook = protocolHelper.paymentsBook
  })

  describe('pay', () => {
    const data = '0xabcd'

    context('when the protocol has not started yet', () => {
      it('reverts', async () => {
        await assertRevert(paymentsBook.pay(token.address, bn(0), someone, data, { from: payer }), PAYMENTS_BOOK_ERRORS.PROTOCOL_HAS_NOT_STARTED)
      })
    })

    context('when the protocol has already started', () => {
      beforeEach('move terms to reach period #0', async () => {
        await controller.mockSetTerm(PERIOD_DURATION)
      })

      context('when the amount is greater than zero', () => {
        const amount = bigExp(1, 18)

        context('when the sender has enough balance', () => {
          const from = payer

          context('when paying with tokens', () => {
            beforeEach('mint tokens', async () => {
              await token.generateTokens(from, amount)
              await token.approve(paymentsBook.address, amount, { from })
            })

            it('pays the requested amount', async () => {
              const previousPayerBalance = await token.balanceOf(from)
              const previousPaymentsBookBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.pay(token.address, amount, someone, data, { from })

              const currentPayerBalance = await token.balanceOf(from)
              assertBn(currentPayerBalance, previousPayerBalance.sub(amount), 'payer balances do not match')

              const currentPaymentsBookBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentPaymentsBookBalance, previousPaymentsBookBalance.add(amount), 'payments book balances do not match')
            })

            it('computes the guardian and governor share correctly', async () => {
              const currentPeriodId = await paymentsBook.getCurrentPeriodId()
              const { guardiansShare: previousGuardiansShare, governorShare: previousGovernorShare } = await paymentsBook.getPeriodShares(currentPeriodId, token.address)

              await paymentsBook.pay(token.address, amount, someone, data, { from })
              const { guardiansShare: currentGuardiansShare, governorShare: currentGovernorShare } = await paymentsBook.getPeriodShares(currentPeriodId, token.address)

              const expectedGovernorShare = amount.mul(GOVERNOR_SHARE_PCT).div(PCT_BASE)
              assertBn(currentGovernorShare, previousGovernorShare.add(expectedGovernorShare), 'period governor share do not match')

              const expectedGuardiansShare = amount.sub(expectedGovernorShare)
              assertBn(currentGuardiansShare, previousGuardiansShare.add(expectedGuardiansShare), 'period guardians share do not match')
            })

            it('emits an event', async () => {
              const currentPeriodId = await paymentsBook.getCurrentPeriodId()
              const receipt = await paymentsBook.pay(token.address, amount, someone, data, { from })

              assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.PAYMENT_RECEIVED)
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.PAYMENT_RECEIVED, { expectedArgs: { periodId: currentPeriodId, payer: someone, sender: from, token, amount } })
            })
          })

          context('when paying with ETH', () => {
            it('pays the requested amount', async () => {
              const previousPayerBalance = bn(await web3.eth.getBalance(from))
              const previousPaymentsBookBalance = bn(await web3.eth.getBalance(paymentsBook.address))

              await paymentsBook.pay(eth.address, amount, someone, data, { from, value: amount })

              const currentPayerBalance = bn(await web3.eth.getBalance(from))
              assert.isTrue(currentPayerBalance.lt(previousPayerBalance.sub(amount)), 'payer balances do not match')

              const currentPaymentsBookBalance = bn(await web3.eth.getBalance(paymentsBook.address))
              assertBn(currentPaymentsBookBalance, previousPaymentsBookBalance.add(amount), 'payments book balances do not match')
            })

            it('computes the guardian and governor shares correctly', async () => {
              const currentPeriodId = await paymentsBook.getCurrentPeriodId()
              const { guardiansShares: previousGuardiansShares, governorShare: previousGovernorShare } = await paymentsBook.getPeriodShares(currentPeriodId, eth.address)

              await paymentsBook.pay(eth.address, amount, someone, data, { from, value: amount })
              const { guardiansShares: currentGuardiansShares, governorShare: currentGovernorShare } = await paymentsBook.getPeriodShares(currentPeriodId, eth.address)

              const expectedGovernorShares = amount.mul(GOVERNOR_SHARE_PCT).div(PCT_BASE)
              assertBn(currentGovernorShare, previousGovernorShare.add(expectedGovernorShares), 'period governor shares do not match')

              const expectedGuardiansShares = amount.sub(expectedGovernorShares)
              assertBn(currentGuardiansShares, previousGuardiansShares.add(expectedGuardiansShares), 'period guardians shares do not match')
            })

            it('emits an event', async () => {
              const currentPeriodId = await paymentsBook.getCurrentPeriodId()
              const receipt = await paymentsBook.pay(eth.address, amount, someone, data, { from, value: amount })

              assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.PAYMENT_RECEIVED)
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.PAYMENT_RECEIVED, { expectedArgs: { periodId: currentPeriodId, payer: someone, sender: from, token: eth, amount } })
            })
          })
        })

        context('when the sender does not have enough balance', () => {
          it('reverts', async () => {
            await assertRevert(paymentsBook.pay(token.address, amount, someone, data), PAYMENTS_BOOK_ERRORS.TOKEN_DEPOSIT_FAILED)
          })
        })
      })

      context('when the amount is zero', () => {
        const amount = bn(0)

        it('reverts', async () => {
          await assertRevert(paymentsBook.pay(token.address, amount, someone, data), PAYMENTS_BOOK_ERRORS.PAYMENT_AMOUNT_ZERO)
        })
      })
    })
  })
})
