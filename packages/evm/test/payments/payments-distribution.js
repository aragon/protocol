const { padLeft, toHex } = require('web3-utils')
const { bn, bigExp, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { PAYMENTS_BOOK_ERRORS } = require('../helpers/utils/errors')
const { PAYMENTS_BOOK_EVENTS } = require('../helpers/utils/events')

const ERC20 = artifacts.require('ERC20Mock')
const PaymentsBook = artifacts.require('PaymentsBook')
const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const DisputeManager = artifacts.require('DisputeManagerMockForRegistry')

contract('PaymentsBook', ([_, payer, someone, guardianPeriod0Term1, guardianPeriod0Term3, guardianMidPeriod1, governor]) => {
  let controller, paymentsBook, guardiansRegistry, eth, token, anotherToken, guardianToken, tokens

  const PCT_BASE = bn(10000)
  const PERIOD_DURATION = 24 * 30           // 30 days, assuming terms are 1h

  const MIN_GUARDIANS_ACTIVE_TOKENS = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  before('deploy some tokens', async () => {
    eth = { address: ZERO_ADDRESS }
    token = await ERC20.new('Some Token', 'FOO', 18)
    anotherToken = await ERC20.new('Another Token', 'BAR', 18)
    tokens = [token.address, anotherToken.address, eth.address]
  })

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor, minActiveBalance: MIN_GUARDIANS_ACTIVE_TOKENS, paymentPeriodDuration: PERIOD_DURATION })

    guardianToken = await ERC20.new('AN Guardians Token', 'ANT', 18)
    guardiansRegistry = await GuardiansRegistry.new(controller.address, guardianToken.address, TOTAL_ACTIVE_BALANCE_LIMIT)
    await controller.setGuardiansRegistry(guardiansRegistry.address)

    const disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  describe('distribution of payment shares', () => {
    const guardianPeriod0Term0Balance = MIN_GUARDIANS_ACTIVE_TOKENS
    const guardianPeriod0Term3Balance = MIN_GUARDIANS_ACTIVE_TOKENS.mul(bn(2))
    const guardianMidPeriod1Balance = MIN_GUARDIANS_ACTIVE_TOKENS.mul(bn(3))

    beforeEach('activate guardians', async () => {
      await controller.mockSetTerm(0) // tokens are activated for the next term
      await guardianToken.generateTokens(guardianPeriod0Term1, guardianPeriod0Term0Balance)
      await guardianToken.approve(guardiansRegistry.address, guardianPeriod0Term0Balance, { from: guardianPeriod0Term1 })
      await guardiansRegistry.stakeAndActivate(guardianPeriod0Term1, guardianPeriod0Term0Balance, '0x', { from: guardianPeriod0Term1 })

      await controller.mockSetTerm(2) // tokens are activated for the next term
      await guardianToken.generateTokens(guardianPeriod0Term3, guardianPeriod0Term3Balance)
      await guardianToken.approve(guardiansRegistry.address, guardianPeriod0Term3Balance, { from: guardianPeriod0Term3 })
      await guardiansRegistry.stakeAndActivate(guardianPeriod0Term3, guardianPeriod0Term3Balance, '0x', { from: guardianPeriod0Term3 })

      await controller.mockSetTerm(PERIOD_DURATION * 1.5 - 1)
      await guardianToken.generateTokens(guardianMidPeriod1, guardianMidPeriod1Balance)
      await guardianToken.approve(guardiansRegistry.address, guardianMidPeriod1Balance, { from: guardianMidPeriod1 })
      await guardiansRegistry.stakeAndActivate(guardianMidPeriod1, guardianMidPeriod1Balance, '0x', { from: guardianMidPeriod1 })
    })

    beforeEach('create payments book module', async () => {
      paymentsBook = await PaymentsBook.new(controller.address, PERIOD_DURATION, 0)
      await controller.setPaymentsBook(paymentsBook.address)
    })

    context('when there were some payments', () => {
      const period0TokenAmount = bigExp(700, 18), period1TokenAmount = bigExp(70, 18)
      const period0AnotherTokenAmount = bigExp(50, 18), period1AnotherTokenAmount = bigExp(5, 18)
      const period0EthAmount = bigExp(1, 18), period1EthAmount = bigExp(1, 16)

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
        await payTokenAmounts(period0TokenAmount, period0AnotherTokenAmount, period0EthAmount)
        await controller.mockIncreaseTerms(PERIOD_DURATION)
        await payTokenAmounts(period1TokenAmount, period1AnotherTokenAmount, period1EthAmount)
      }

      context('when requesting a past period', () => {
        const periodId = 0

        const guardianShare = (collectedAmount, governorSharePct, guardianShareMultiplier) => {
          const governorShare = governorSharePct.mul(collectedAmount).div(PCT_BASE)
          return guardianShareMultiplier(collectedAmount.sub(governorShare))
        }

        const itDistributesGuardianSharesCorrectly = (guardian, governorSharePct, guardianShareMultiplier = x => x) => {
          const expectedGuardianTokenShare = guardianShare(period0TokenAmount, governorSharePct, guardianShareMultiplier)
          const expectedGuardianAnotherTokenShare = guardianShare(period0AnotherTokenAmount, governorSharePct, guardianShareMultiplier)
          const expectedGuardianEthShare = guardianShare(period0EthAmount, governorSharePct, guardianShareMultiplier)

          const expectedGovernorTokenAmount = governorSharePct.mul(period0TokenAmount).div(PCT_BASE)
          const expectedGovernorAnotherTokenAmount = governorSharePct.mul(period0AnotherTokenAmount).div(PCT_BASE)
          const expectedGovernorEthAmount = governorSharePct.mul(period0EthAmount).div(PCT_BASE)

          beforeEach("set governor's share and execute payments", async () => {
            await paymentsBook.setGovernorSharePct(governorSharePct, { from: governor })
            await executePayments()
          })

          it("estimates guardian's share correctly", async () => {
            const shares = await paymentsBook.getGuardianShare(periodId, guardian, tokens)

            assertBn(shares[0], expectedGuardianTokenShare, 'guardian token share does not match')
            assertBn(shares[1], expectedGuardianAnotherTokenShare, 'guardian another token share does not match')
            assertBn(shares[2], expectedGuardianEthShare, 'guardian eth share does not match')
          })

          it('transfers share of payments to the guardian', async () => {
            assert.isTrue((await paymentsBook.canGuardianClaim(periodId, guardian, [token.address])).every(Boolean))
            const previousBalance = await token.balanceOf(guardian)

            await paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardian })

            assert.isFalse((await paymentsBook.canGuardianClaim(periodId, guardian, [token.address])).every(Boolean))

            const currentBalance = await token.balanceOf(guardian)
            assertBn(currentBalance, previousBalance.add(expectedGuardianTokenShare), 'guardian token balance does not match')
          })

          it("cannot claim a guardian's share twice", async () => {
            await paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardian })

            await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardian }), PAYMENTS_BOOK_ERRORS.GUARDIAN_CANNOT_CLAIM_SHARE)
          })

          it("can claim guardian's remaining share of payments", async () => {
            const tokens = [anotherToken.address, eth.address]
            const previousEthBalance = bn(await web3.eth.getBalance(guardian))
            const previousTokenBalance = await anotherToken.balanceOf(guardian)

            await paymentsBook.claimGuardianShare(periodId, tokens, { from: guardian })

            const canClaim = await paymentsBook.canGuardianClaim(periodId, guardian, tokens)
            assert.isFalse(canClaim.every(Boolean), 'guardian claim share status does not match')

            const currentTokenBalance = await anotherToken.balanceOf(guardian)
            assertBn(currentTokenBalance, previousTokenBalance.add(expectedGuardianAnotherTokenShare), 'guardian token balance does not match')

            const currentEthBalance = bn(await web3.eth.getBalance(guardian))
            assert.isTrue(currentEthBalance.gt(previousEthBalance), 'guardian eth balance does not match')
          })

          it("emits an event when claiming a guardian's share", async () => {
            const receipt = await paymentsBook.claimGuardianShare(periodId, tokens, { from: guardian })

            assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_SHARE_CLAIMED, { expectedAmount: 3 })
            assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_SHARE_CLAIMED, { index: 0, expectedArgs: { guardian, periodId, token: tokens[0], amount: expectedGuardianTokenShare } })
            assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_SHARE_CLAIMED, { index: 1, expectedArgs: { guardian, periodId, token: tokens[1], amount: expectedGuardianAnotherTokenShare } })
            assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_SHARE_CLAIMED, { index: 2, expectedArgs: { guardian, periodId, token: tokens[2], amount: expectedGuardianEthShare } })
          })

          if (governorSharePct.eq(bn(0))) {
            it("ignores governor's request to transfer its share of payments", async () => {
              const previousTokenBalance = await token.balanceOf(paymentsBook.address)
              const previousAnotherTokenBalance = await token.balanceOf(paymentsBook.address)
              const previousEthBalance = bn(await web3.eth.getBalance(paymentsBook.address))

              const receipt = await paymentsBook.claimGovernorShare(periodId, tokens)

              const currentTokenBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentTokenBalance, previousTokenBalance, 'payments book token balance does not match')

              const currentAnotherTokenBalance = await token.balanceOf(paymentsBook.address)
              assertBn(currentAnotherTokenBalance, previousAnotherTokenBalance, 'payments book another token balance does not match')

              const currentEthBalance = bn(await web3.eth.getBalance(paymentsBook.address))
              assertBn(currentEthBalance, previousEthBalance, 'payments book eth balance does not match')

              assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_CLAIMED, { expectedAmount: 0 })
            })
          } else {
            it("estimates governor's share of payments correctly", async () => {
              const shares = await paymentsBook.getGovernorShare(periodId, tokens)

              assertBn(shares[0], expectedGovernorTokenAmount, 'governor token share does not match')
              assertBn(shares[1], expectedGovernorAnotherTokenAmount, 'governor another token share does not match')
              assertBn(shares[2], expectedGovernorEthAmount, 'governor eth share does not match')
            })

            it("transfers governor's share of payments", async () => {
              const previousBalance = await token.balanceOf(governor)
              assert.isTrue((await paymentsBook.canGovernorClaim(periodId, [token.address])).every(Boolean))

              await paymentsBook.claimGovernorShare(periodId, [token.address])

              assert.isFalse((await paymentsBook.canGovernorClaim(periodId, [token.address])).every(Boolean))

              const currentBalance = await token.balanceOf(governor)
              assertBn(currentBalance, previousBalance.add(expectedGovernorTokenAmount), 'governor token balance does not match')
            })

            it('cannot claim the governor share twice', async () => {
              await paymentsBook.claimGovernorShare(periodId, [token.address])

              await assertRevert(paymentsBook.claimGovernorShare(periodId, [token.address]), PAYMENTS_BOOK_ERRORS.GOVERNOR_CANNOT_CLAIM_SHARE)
            })

            it("can claim governor's remaining share of payments", async () => {
              const tokens = [anotherToken.address, eth.address]
              const previousEthBalance = bn(await web3.eth.getBalance(governor))
              const previousTokenBalance = await anotherToken.balanceOf(governor)

              await paymentsBook.claimGovernorShare(periodId, tokens)

              const canClaim = await paymentsBook.canGovernorClaim(periodId, tokens)
              assert.isFalse(canClaim.every(Boolean), 'guardian claim share status does not match')

              const currentTokenBalance = await anotherToken.balanceOf(governor)
              assertBn(currentTokenBalance, previousTokenBalance.add(expectedGovernorAnotherTokenAmount), 'guardian token balance does not match')

              const currentEthBalance = bn(await web3.eth.getBalance(governor))
              assert.isTrue(currentEthBalance.gt(previousEthBalance), 'guardian eth balance does not match')
            })

            it("emits an event when requesting governor's share", async () => {
              const receipt = await paymentsBook.claimGovernorShare(periodId, tokens)

              assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_CLAIMED, { expectedAmount: 3 })
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_CLAIMED, { index: 0, expectedArgs: { periodId, token: tokens[0], amount: expectedGovernorTokenAmount } })
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_CLAIMED, { index: 1, expectedArgs: { periodId, token: tokens[1], amount: expectedGovernorAnotherTokenAmount } })
              assertEvent(receipt, PAYMENTS_BOOK_EVENTS.GOVERNOR_SHARE_CLAIMED, { index: 2, expectedArgs: { periodId, token: tokens[2], amount: expectedGovernorEthAmount } })
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

            context("when the governor's share is zero", async () => {
              const governorSharePct = bn(0)

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct)
            })

            context("when the governor's share is greater than zero", async () => {
              const governorSharePct = bn(100) // 1%

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct)
            })
          })

          context('when the claiming guardian was not active yet', async () => {
            const guardian = guardianPeriod0Term3

            beforeEach('execute payments', executePayments)

            it("estimates guardian's share correctly", async () => {
              const share = await paymentsBook.getGuardianShare(periodId, guardian, [token.address])

              assertBn(share[0], 0, 'guardian share does not match')
            })

            it('is not owed any share of the payments', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardian })

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
            const guardianShareMultiplier = x => x.mul(guardianPeriod0Term0Balance).div(expectedTotalActiveBalance)

            context("when the governor's share is zero", async () => {
              const governorSharePct = bn(0)

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct, guardianShareMultiplier)
            })

            context("when the governor's share is greater than zero", async () => {
              const governorSharePct = bn(100) // 1%

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct, guardianShareMultiplier)
            })
          })

          context('when the claiming guardian was active at that term', async () => {
            const guardian = guardianPeriod0Term3
            const guardianShareMultiplier = x => x.mul(guardianPeriod0Term3Balance).div(expectedTotalActiveBalance)

            context("when the governor's share is zero", async () => {
              const governorSharePct = bn(0)

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct, guardianShareMultiplier)
            })

            context("when the governor's share is greater than zero", async () => {
              const governorSharePct = bn(100) // 1%

              itDistributesGuardianSharesCorrectly(guardian, governorSharePct, guardianShareMultiplier)
            })
          })

          context('when the claiming guardian was not active yet', async () => {
            const guardian = guardianMidPeriod1

            beforeEach('execute payments', executePayments)

            it("estimates guardian's share correctly", async () => {
              const share = await paymentsBook.getGuardianShare(periodId, guardian, [token.address])

              assertBn(share[0], 0, 'guardian share does not match')
            })

            it('is not owed any share of the payments', async () => {
              const previousBalance = await token.balanceOf(paymentsBook.address)

              await paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardian })

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
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        beforeEach('execute payments', executePayments)

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term3 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianMidPeriod1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })

    context('when there were no payments', () => {
      context('when requesting a past period', () => {
        const periodId = 0

        it('ignores the request', async () => {
          const previousBalance = await token.balanceOf(paymentsBook.address)

          const receipt = await paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term1 })

          const currentBalance = await token.balanceOf(paymentsBook.address)
          assertBn(currentBalance, previousBalance, 'payments book balance does not match')

          assertAmountOfEvents(receipt, PAYMENTS_BOOK_EVENTS.GUARDIAN_SHARE_CLAIMED, { expectedAmount: 0 })
        })
      })

      context('when requesting the current period', () => {
        const periodId = 1

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })

      context('when requesting a future period', () => {
        const periodId = 2

        it('reverts', async () => {
          await assertRevert(paymentsBook.claimGuardianShare(periodId, [token.address], { from: guardianPeriod0Term1 }), PAYMENTS_BOOK_ERRORS.NON_PAST_PERIOD)
        })
      })
    })
  })
})
