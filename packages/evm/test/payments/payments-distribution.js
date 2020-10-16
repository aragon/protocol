const { padLeft, toHex } = require('web3-utils')
const { bn, bigExp, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { ACTIVATE_DATA } = require('../helpers/utils/jurors')
const { PAYMENTS_BOOK_ERRORS } = require('../helpers/utils/errors')
const { PAYMENTS_BOOK_EVENTS } = require('../helpers/utils/events')

const ERC20 = artifacts.require('ERC20Mock')
const PaymentsBook = artifacts.require('PaymentsBook')
const JurorsRegistry = artifacts.require('JurorsRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')

contract('PaymentsBook', ([_, payer, someone, jurorPeriod0Term1, jurorPeriod0Term3, jurorMidPeriod1, governor]) => {
  let controller, paymentsBook, jurorsRegistry, eth, token, anotherToken, jurorToken

  const PCT_BASE = bn(10000)
  const PERIOD_DURATION = 24 * 30           // 30 days, assuming terms are 1h

  const MIN_JURORS_ACTIVE_TOKENS = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('deploy some tokens', async () => {
    eth = { address: ZERO_ADDRESS }
    token = await ERC20.new('Some Token', 'FOO', 18)
    anotherToken = await ERC20.new('Another Token', 'BAR', 18)
  })

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor, minActiveBalance: MIN_JURORS_ACTIVE_TOKENS, paymentPeriodDuration: PERIOD_DURATION })

    jurorToken = await ERC20.new('AN Jurors Token', 'ANJ', 18)
    jurorsRegistry = await JurorsRegistry.new(controller.address, jurorToken.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setJurorsRegistry(jurorsRegistry.address)

    const disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  describe('fees distribution', () => {
    const jurorPeriod0Term0Balance = MIN_JURORS_ACTIVE_TOKENS
    const jurorPeriod0Term3Balance = MIN_JURORS_ACTIVE_TOKENS.mul(bn(2))
    const jurorMidPeriod1Balance = MIN_JURORS_ACTIVE_TOKENS.mul(bn(3))

    beforeEach('activate jurors', async () => {
      await controller.mockSetTerm(0) // tokens are activated for the next term
      await jurorToken.generateTokens(jurorPeriod0Term1, jurorPeriod0Term0Balance)
      await jurorToken.approveAndCall(jurorsRegistry.address, jurorPeriod0Term0Balance, ACTIVATE_DATA, { from: jurorPeriod0Term1 })

      await controller.mockSetTerm(2) // tokens are activated for the next term
      await jurorToken.generateTokens(jurorPeriod0Term3, jurorPeriod0Term3Balance)
      await jurorToken.approveAndCall(jurorsRegistry.address, jurorPeriod0Term3Balance, ACTIVATE_DATA, { from: jurorPeriod0Term3 })

      await controller.mockSetTerm(PERIOD_DURATION * 1.5 - 1)
      await jurorToken.generateTokens(jurorMidPeriod1, jurorMidPeriod1Balance)
      await jurorToken.approveAndCall(jurorsRegistry.address, jurorMidPeriod1Balance, ACTIVATE_DATA, { from: jurorMidPeriod1 })
    })

    beforeEach('create payments book module', async () => {
      paymentsBook = await PaymentsBook.new(controller.address, PERIOD_DURATION, 0)
      await controller.setPaymentsBook(paymentsBook.address)
    })

    context('when there were some payments', () => {
      const period0TokenFees = bigExp(700, 18), period1TokenFees = bigExp(70, 18)
      const period0AnotherTokenFees = bigExp(50, 18), period1AnotherTokenFees = bigExp(5, 18)
      const period0EthFees = bigExp(1, 18), period1EthFees = bigExp(1, 16)

      const payTokenAmounts = async (tokenAmount, anotherTokenAmount, ethAmount) => {
        await token.generateTokens(payer, tokenAmount)
        await token.approve(paymentsBook.address, tokenAmount, { from: payer })
        await paymentsBook.pay(token.address, tokenAmount, someone, '0x1234', { from: payer })

        await anotherToken.generateTokens(payer, anotherTokenAmount)
        await anotherToken.approve(paymentsBook.address, anotherTokenAmount, { from: payer })
        await paymentsBook.pay(anotherToken.address, anotherTokenAmount, someone, '0xabcd', { from: payer })

        await paymentsBook.pay(eth.address, ethAmount, someone, '0xab12', { from: payer, value: ethAmount })
      }

      const executePayments = async () => {
        await controller.mockSetTerm(PERIOD_DURATION)
        await payTokenAmounts(period0TokenFees, period0AnotherTokenFees, period0EthFees)
        await controller.mockIncreaseTerms(PERIOD_DURATION)
        await payTokenAmounts(period1TokenFees, period1AnotherTokenFees, period1EthFees)
      }

      context('when requesting a past period', () => {
        const periodId = 0

        const jurorFees = (totalFees, governorShare, jurorShare) => {
          const governorFees = governorShare.mul(totalFees).div(PCT_BASE)
          return jurorShare(totalFees.sub(governorFees))
        }

        const itDistributesJurorFeesCorrectly = (juror, governorShare, jurorShare = x => x) => {
          const expectedJurorTokenFees = jurorFees(period0TokenFees, governorShare, jurorShare)
          const expectedJurorAnotherTokenFees = jurorFees(period0AnotherTokenFees, governorShare, jurorShare)
          const expectedJurorEthFees = jurorFees(period0EthFees, governorShare, jurorShare)

          const expectedGovernorTokenFees = governorShare.mul(period0TokenFees).div(PCT_BASE)
          const expectedGovernorAnotherTokenFees = governorShare.mul(period0AnotherTokenFees).div(PCT_BASE)
          const expectedGovernorEthFees = governorShare.mul(period0EthFees).div(PCT_BASE)

          beforeEach('set governor share and execute payments', async () => {
            await paymentsBook.setGovernorSharePct(governorShare, { from: governor })
            await executePayments()
          })

          it('estimates juror fees correctly', async () => {
            const fees = await paymentsBook.getJurorFees(periodId, juror, token.address)
            const otherFees = await paymentsBook.getManyJurorFees(periodId, juror, [anotherToken.address, eth.address])

            assertBn(fees, expectedJurorTokenFees, 'juror fees does not match')
            assertBn(otherFees[0], expectedJurorAnotherTokenFees, 'juror another token fees does not match')
            assertBn(otherFees[1], expectedJurorEthFees, 'juror eth fees does not match')
          })

          it('transfers fees to the juror', async () => {
            assert.isFalse(await paymentsBook.hasJurorClaimed(periodId, juror, token.address))
            const previousBalance = await token.balanceOf(juror)

            await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })

            assert.isTrue(await paymentsBook.hasJurorClaimed(periodId, juror, token.address))

            const currentBalance = await token.balanceOf(juror)
            assertBn(currentBalance, previousBalance.add(expectedJurorTokenFees), 'juror token balance does not match')
          })

          it('cannot claim juror fees twice', async () => {
            await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })

            await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: juror }), PAYMENTS_BOOK_ERRORS.JUROR_FEES_ALREADY_CLAIMED)
          })

          it('can claim remaining juror fees', async () => {
            const tokens = [anotherToken.address, eth.address]
            const previousEthBalance = bn(await web3.eth.getBalance(juror))
            const previousTokenBalance = await anotherToken.balanceOf(juror)

            await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })
            await paymentsBook.claimManyJurorFees(periodId, tokens, { from: juror })

            const hasClaimed = await paymentsBook.hasJurorClaimedMany(periodId, juror, tokens)
            assert.isTrue(hasClaimed.every(Boolean), 'juror claim fees status does not match')

            const currentTokenBalance = await anotherToken.balanceOf(juror)
            assertBn(currentTokenBalance, previousTokenBalance.add(expectedJurorAnotherTokenFees), 'juror token balance does not match')

            const currentEthBalance = bn(await web3.eth.getBalance(juror))
            assert.isTrue(currentEthBalance.gt(previousEthBalance), 'juror eth balance does not match')
          })

          it('emits an event when claiming juror fees', async () => {
            const tokens = [anotherToken.address, eth.address]

            const receipt = await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })
            const anotherReceipt = await paymentsBook.claimManyJurorFees(periodId, tokens, { from: juror })

            assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.JUROR_FEES_CLAIMED)
            assertEvent(receipt, PAYMENTS_BOOK_EVENTS.JUROR_FEES_CLAIMED, { expectedArgs: { juror, periodId, token, amount: expectedJurorTokenFees } })

            assertAmountOfEvents(anotherReceipt, PAYMENTS_BOOK_EVENTS.JUROR_FEES_CLAIMED, { expectedAmount: 2 })
            assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.JUROR_FEES_CLAIMED, { index: 0, expectedArgs: { juror, periodId, token: tokens[0], amount: expectedJurorAnotherTokenFees } })
            assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.JUROR_FEES_CLAIMED, { index: 1, expectedArgs: { juror, periodId, token: tokens[1], amount: expectedJurorEthFees } })
          })

          if (governorShare.eq(bn(0))) {
            it('ignores governor fees request', async () => {
              const previousTokenBalance = await token.balanceOf(paymentsBook.address)
              const previousAnotherTokenBalance = await token.balanceOf(paymentsBook.address)
              const previousEthBalance = bn(await web3.eth.getBalance(paymentsBook.address))

              await paymentsBook.transferManyGovernorFees(periodId, [token.address, anotherToken.address, eth.address])

              const currentTokenBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentTokenBalance, previousTokenBalance, 'payments book token balance does not match')

              const currentAnotherTokenBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentAnotherTokenBalance, previousAnotherTokenBalance, 'payments book another token balance does not match')

              const currentEthBalance = bn(await web3.eth.getBalance(paymentsBook.address))
              assertBn(currentEthBalance, previousEthBalance, 'payments book eth balance does not match')
            })
          } else {
            it('estimates governor fees correctly', async () => {
              const fees = await paymentsBook.getGovernorFees(periodId, token.address)
              const otherFees = await paymentsBook.getManyGovernorFees(periodId, [anotherToken.address, eth.address])

              assertBn(fees, expectedGovernorTokenFees, 'governor token fees does not match')
              assertBn(otherFees[0], expectedGovernorAnotherTokenFees, 'governor another token fees does not match')
              assertBn(otherFees[1], expectedGovernorEthFees, 'governor eth fees does not match')
            })

            it('transfers fees to the governor', async () => {
              const previousBalance = await token.balanceOf(governor)

              await paymentsBook.transferGovernorFees(periodId, token.address)

              const fees = await paymentsBook.getGovernorFees(periodId, token.address)
              assertBn(fees, 0, 'governor token fees does not match')

              const currentBalance = await token.balanceOf(governor)
              assertBn(currentBalance, previousBalance.add(expectedGovernorTokenFees), 'governor token balance does not match')
            })

            it('ignores duplicated governor requests', async () => {
              const previousBalance = await token.balanceOf(governor)

              await paymentsBook.transferGovernorFees(periodId, token.address)
              await paymentsBook.transferGovernorFees(periodId, token.address)

              const currentBalance = await token.balanceOf(governor)
              assertBn(currentBalance, previousBalance.add(expectedGovernorTokenFees), 'governor token balance does not match')
            })

            it('can claim governor remaining fees', async () => {
              const tokens = [anotherToken.address, eth.address]
              const previousEthBalance = bn(await web3.eth.getBalance(governor))
              const previousTokenBalance = await anotherToken.balanceOf(governor)

              await paymentsBook.transferGovernorFees(periodId, token.address)
              await paymentsBook.transferManyGovernorFees(periodId, tokens)

              const otherFees = await paymentsBook.getManyGovernorFees(periodId, tokens)
              assertBn(otherFees[0], 0, 'governor another token fees does not match')
              assertBn(otherFees[1], 0, 'governor eth fees does not match')

              const currentTokenBalance = await anotherToken.balanceOf(governor)
              assertBn(currentTokenBalance, previousTokenBalance.add(expectedGovernorAnotherTokenFees), 'juror token balance does not match')

              const currentEthBalance = bn(await web3.eth.getBalance(governor))
              assert.isTrue(currentEthBalance.gt(previousEthBalance), 'juror eth balance does not match')
            })

            it('emits an event when requesting governor fees', async () => {
              const tokens = [anotherToken.address, eth.address]

              const receipt = await paymentsBook.transferGovernorFees(periodId, token.address)
              const anotherReceipt = await paymentsBook.transferManyGovernorFees(periodId, tokens)

              assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_FEES_TRANSFERRED)
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_FEES_TRANSFERRED, { expectedArgs: { periodId, token, amount: expectedGovernorTokenFees } })

              assertAmountOfEvents(anotherReceipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_FEES_TRANSFERRED, { expectedAmount: 2 })
              assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_FEES_TRANSFERRED, { index: 0, expectedArgs: { periodId, token: tokens[0], amount: expectedGovernorAnotherTokenFees } })
              assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_FEES_TRANSFERRED, { index: 1, expectedArgs: { periodId, token: tokens[1], amount: expectedGovernorEthFees } })
            })
          }
        }

        context('when the checkpoint used is at term #1', () => {
          const expectedTotalActiveBalance = jurorPeriod0Term0Balance

          beforeEach('mock term randomness', async () => {
            const randomness = padLeft(toHex(PERIOD_DURATION), 64)
            await controller.mockSetTermRandomness(randomness)
            await paymentsBook.ensurePeriodBalanceDetails(periodId)
          })

          it('computes total active balance correctly', async () => {
            const { balanceCheckpoint, totalActiveBalance } = await paymentsBook.getPeriodBalanceDetails(periodId)

            assertBn(balanceCheckpoint, 1, 'checkpoint does not match')
            assertBn(totalActiveBalance, expectedTotalActiveBalance, 'total active balance does not match')
          })

          context('when the claiming juror was active at that term', async () => {
            const juror = jurorPeriod0Term1

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesJurorFeesCorrectly(juror, governorShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesJurorFeesCorrectly(juror, governorShare)
            })
          })

          context('when the claiming juror was not active yet', async () => {
            const juror = jurorPeriod0Term3

            beforeEach('execute payments', executePayments)

            it('estimates juror fees correctly', async () => {
              const fees = await paymentsBook.getJurorFees(periodId, juror, token.address)

              assertBn(fees, 0, 'juror fees does not match')
            })

            it('does not transfer any fees', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })

              const currentBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentBalance, previousBalance, 'payments book balance does not match')
            })
          })
        })

        context('when the checkpoint used is at term #3', () => {
          const expectedTotalActiveBalance = jurorPeriod0Term0Balance.add(jurorPeriod0Term3Balance)

          beforeEach('mock term randomness', async () => {
            const randomness = padLeft(toHex(PERIOD_DURATION + 2), 64)
            await controller.mockSetTermRandomness(randomness)
            await paymentsBook.ensurePeriodBalanceDetails(periodId)
          })

          it('computes total active balance correctly', async () => {
            const { balanceCheckpoint, totalActiveBalance } = await paymentsBook.getPeriodBalanceDetails(periodId)

            assertBn(balanceCheckpoint, 3, 'checkpoint does not match')
            assertBn(totalActiveBalance, expectedTotalActiveBalance, 'total active balance does not match')
          })

          context('when the claiming juror was active before that term', async () => {
            const juror = jurorPeriod0Term1
            const jurorShare = x => x.mul(jurorPeriod0Term0Balance).div(expectedTotalActiveBalance)

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesJurorFeesCorrectly(juror, governorShare, jurorShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesJurorFeesCorrectly(juror, governorShare, jurorShare)
            })
          })

          context('when the claiming juror was active at that term', async () => {
            const juror = jurorPeriod0Term3
            const jurorShare = x => x.mul(jurorPeriod0Term3Balance).div(expectedTotalActiveBalance)

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesJurorFeesCorrectly(juror, governorShare, jurorShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesJurorFeesCorrectly(juror, governorShare, jurorShare)
            })
          })

          context('when the claiming juror was not active yet', async () => {
            const juror = jurorMidPeriod1

            beforeEach('execute payments', executePayments)

            it('estimates juror fees correctly', async () => {
              const fees = await paymentsBook.getJurorFees(periodId, juror, token.address)

              assertBn(fees, 0, 'juror fees does not match')
            })

            it('does not transfer any fees', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimJurorFees(periodId, token.address, { from: juror })

              const currentBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentBalance, previousBalance, 'payments book balance does not match')
            })
          })
        })
      })

      context('when requesting the current period', () => {
        const periodId = 1

        beforeEach('execute payments', executePayments)

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        beforeEach('execute payments', executePayments)

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })

    context('when there were no payments', () => {
      context('when requesting a past period', () => {
        const periodId = 0

        it('ignores the request', async () => {
          const previousBalance = await token.balanceOf(paymentsBook.address)

          await paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term1 })

          const currentBalance = await token.balanceOf(paymentsBook.address)
          assertBn(currentBalance, previousBalance, 'payments book balance does not match')
        })
      })

      context('when requesting the current period', () => {
        const periodId = 1

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimJurorFees(periodId, token.address, { from: jurorPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })
  })
})
