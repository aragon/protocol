const { padLeft, toHex } = require('web3-utils')
const { bn, bigExp, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { ACTIVATE_DATA } = require('../helpers/utils/guardians')
const { PAYMENTS_BOOK_ERRORS } = require('../helpers/utils/errors')
const { PAYMENTS_BOOK_EVENTS } = require('../helpers/utils/events')

const ERC20 = artifacts.require('ERC20Mock')
const PaymentsBook = artifacts.require('PaymentsBook')
const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')

contract('PaymentsBook', ([_, payer, someone, guardianPeriod0Term1, guardianPeriod0Term3, guardianMidPeriod1, governor]) => {
  let controller, paymentsBook, guardiansRegistry, eth, token, anotherToken, guardianToken

  const PCT_BASE = bn(10000)
  const PERIOD_DURATION = 24 * 30           // 30 days, assuming terms are 1h

  const MIN_GUARDIANS_ACTIVE_TOKENS = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('deploy some tokens', async () => {
    eth = { address: ZERO_ADDRESS }
    token = await ERC20.new('Some Token', 'FOO', 18)
    anotherToken = await ERC20.new('Another Token', 'BAR', 18)
  })

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor, minActiveBalance: MIN_GUARDIANS_ACTIVE_TOKENS, paymentPeriodDuration: PERIOD_DURATION })

    guardianToken = await ERC20.new('AN Guardians Token', 'ANJ', 18)
    guardiansRegistry = await GuardiansRegistry.new(controller.address, guardianToken.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(guardiansRegistry.address)

    const disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  describe('fees distribution', () => {
    const guardianPeriod0Term0Balance = MIN_GUARDIANS_ACTIVE_TOKENS
    const guardianPeriod0Term3Balance = MIN_GUARDIANS_ACTIVE_TOKENS.mul(bn(2))
    const guardianMidPeriod1Balance = MIN_GUARDIANS_ACTIVE_TOKENS.mul(bn(3))

    beforeEach('activate guardians', async () => {
      await controller.mockSetTerm(0) // tokens are activated for the next term
      await guardianToken.generateTokens(guardianPeriod0Term1, guardianPeriod0Term0Balance)
      await guardianToken.approveAndCall(guardiansRegistry.address, guardianPeriod0Term0Balance, ACTIVATE_DATA, { from: guardianPeriod0Term1 })

      await controller.mockSetTerm(2) // tokens are activated for the next term
      await guardianToken.generateTokens(guardianPeriod0Term3, guardianPeriod0Term3Balance)
      await guardianToken.approveAndCall(guardiansRegistry.address, guardianPeriod0Term3Balance, ACTIVATE_DATA, { from: guardianPeriod0Term3 })

      await controller.mockSetTerm(PERIOD_DURATION * 1.5 - 1)
      await guardianToken.generateTokens(guardianMidPeriod1, guardianMidPeriod1Balance)
      await guardianToken.approveAndCall(guardiansRegistry.address, guardianMidPeriod1Balance, ACTIVATE_DATA, { from: guardianMidPeriod1 })
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

        const guardianFees = (totalFees, governorShare, guardianShare) => {
          const governorFees = governorShare.mul(totalFees).div(PCT_BASE)
          return guardianShare(totalFees.sub(governorFees))
        }

        const itDistributesGuardianFeesCorrectly = (guardian, governorShare, guardianShare = x => x) => {
          const expectedGuardianTokenFees = guardianFees(period0TokenFees, governorShare, guardianShare)
          const expectedGuardianAnotherTokenFees = guardianFees(period0AnotherTokenFees, governorShare, guardianShare)
          const expectedGuardianEthFees = guardianFees(period0EthFees, governorShare, guardianShare)

          const expectedGovernorTokenFees = governorShare.mul(period0TokenFees).div(PCT_BASE)
          const expectedGovernorAnotherTokenFees = governorShare.mul(period0AnotherTokenFees).div(PCT_BASE)
          const expectedGovernorEthFees = governorShare.mul(period0EthFees).div(PCT_BASE)

          beforeEach('set governor share and execute payments', async () => {
            await paymentsBook.setGovernorSharePct(governorShare, { from: governor })
            await executePayments()
          })

          it('estimates guardian fees correctly', async () => {
            const fees = await paymentsBook.getGuardianFees(periodId, guardian, token.address)
            const otherFees = await paymentsBook.getManyGuardianFees(periodId, guardian, [anotherToken.address, eth.address])

            assertBn(fees, expectedGuardianTokenFees, 'guardian fees does not match')
            assertBn(otherFees[0], expectedGuardianAnotherTokenFees, 'guardian another token fees does not match')
            assertBn(otherFees[1], expectedGuardianEthFees, 'guardian eth fees does not match')
          })

          it('transfers fees to the guardian', async () => {
            assert.isFalse(await paymentsBook.hasGuardianClaimed(periodId, guardian, token.address))
            const previousBalance = await token.balanceOf(guardian)

            await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })

            assert.isTrue(await paymentsBook.hasGuardianClaimed(periodId, guardian, token.address))

            const currentBalance = await token.balanceOf(guardian)
            assertBn(currentBalance, previousBalance.add(expectedGuardianTokenFees), 'guardian token balance does not match')
          })

          it('cannot claim guardian fees twice', async () => {
            await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })

            await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian }), PAYMENTS_BOOK_ERRORS.GUARDIAN_FEES_ALREADY_CLAIMED)
          })

          it('can claim remaining guardian fees', async () => {
            const tokens = [anotherToken.address, eth.address]
            const previousEthBalance = bn(await web3.eth.getBalance(guardian))
            const previousTokenBalance = await anotherToken.balanceOf(guardian)

            await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })
            await paymentsBook.claimManyGuardianFees(periodId, tokens, { from: guardian })

            const hasClaimed = await paymentsBook.hasGuardianClaimedMany(periodId, guardian, tokens)
            assert.isTrue(hasClaimed.every(Boolean), 'guardian claim fees status does not match')

            const currentTokenBalance = await anotherToken.balanceOf(guardian)
            assertBn(currentTokenBalance, previousTokenBalance.add(expectedGuardianAnotherTokenFees), 'guardian token balance does not match')

            const currentEthBalance = bn(await web3.eth.getBalance(guardian))
            assert.isTrue(currentEthBalance.gt(previousEthBalance), 'guardian eth balance does not match')
          })

          it('emits an event when claiming guardian fees', async () => {
            const tokens = [anotherToken.address, eth.address]

            const receipt = await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })
            const anotherReceipt = await paymentsBook.claimManyGuardianFees(periodId, tokens, { from: guardian })

            assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_FEES_CLAIMED)
            assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_FEES_CLAIMED, { expectedArgs: { guardian, periodId, token, amount: expectedGuardianTokenFees } })

            assertAmountOfEvents(anotherReceipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_FEES_CLAIMED, { expectedAmount: 2 })
            assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_FEES_CLAIMED, { index: 0, expectedArgs: { guardian, periodId, token: tokens[0], amount: expectedGuardianAnotherTokenFees } })
            assertEvent(anotherReceipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_FEES_CLAIMED, { index: 1, expectedArgs: { guardian, periodId, token: tokens[1], amount: expectedGuardianEthFees } })
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
              assertBn(currentTokenBalance, previousTokenBalance.add(expectedGovernorAnotherTokenFees), 'guardian token balance does not match')

              const currentEthBalance = bn(await web3.eth.getBalance(governor))
              assert.isTrue(currentEthBalance.gt(previousEthBalance), 'guardian eth balance does not match')
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
          const expectedTotalActiveBalance = guardianPeriod0Term0Balance

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

          context('when the claiming guardian was active at that term', async () => {
            const guardian = guardianPeriod0Term1

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesGuardianFeesCorrectly(guardian, governorShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesGuardianFeesCorrectly(guardian, governorShare)
            })
          })

          context('when the claiming guardian was not active yet', async () => {
            const guardian = guardianPeriod0Term3

            beforeEach('execute payments', executePayments)

            it('estimates guardian fees correctly', async () => {
              const fees = await paymentsBook.getGuardianFees(periodId, guardian, token.address)

              assertBn(fees, 0, 'guardian fees does not match')
            })

            it('does not transfer any fees', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })

              const currentBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentBalance, previousBalance, 'payments book balance does not match')
            })
          })
        })

        context('when the checkpoint used is at term #3', () => {
          const expectedTotalActiveBalance = guardianPeriod0Term0Balance.add(guardianPeriod0Term3Balance)

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

          context('when the claiming guardian was active before that term', async () => {
            const guardian = guardianPeriod0Term1
            const guardianShare = x => x.mul(guardianPeriod0Term0Balance).div(expectedTotalActiveBalance)

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesGuardianFeesCorrectly(guardian, governorShare, guardianShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesGuardianFeesCorrectly(guardian, governorShare, guardianShare)
            })
          })

          context('when the claiming guardian was active at that term', async () => {
            const guardian = guardianPeriod0Term3
            const guardianShare = x => x.mul(guardianPeriod0Term3Balance).div(expectedTotalActiveBalance)

            context('when the governor share is zero', async () => {
              const governorShare = bn(0)

              itDistributesGuardianFeesCorrectly(guardian, governorShare, guardianShare)
            })

            context('when the governor share is greater than zero', async () => {
              const governorShare = bn(100) // 1%

              itDistributesGuardianFeesCorrectly(guardian, governorShare, guardianShare)
            })
          })

          context('when the claiming guardian was not active yet', async () => {
            const guardian = guardianMidPeriod1

            beforeEach('execute payments', executePayments)

            it('estimates guardian fees correctly', async () => {
              const fees = await paymentsBook.getGuardianFees(periodId, guardian, token.address)

              assertBn(fees, 0, 'guardian fees does not match')
            })

            it('does not transfer any fees', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardian })

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
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        beforeEach('execute payments', executePayments)

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })

    context('when there were no payments', () => {
      context('when requesting a past period', () => {
        const periodId = 0

        it('ignores the request', async () => {
          const previousBalance = await token.balanceOf(paymentsBook.address)

          await paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term1 })

          const currentBalance = await token.balanceOf(paymentsBook.address)
          assertBn(currentBalance, previousBalance, 'payments book balance does not match')
        })
      })

      context('when requesting the current period', () => {
        const periodId = 1

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianFees(periodId, token.address, { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })
  })
})
