const { ZERO_ADDRESS, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { CONTROLLED_ERRORS, REGISTRY_ERRORS } = require('../helpers/utils/errors')

const GuardiansRegistry = artifacts.require('GuardiansRegistry')
const ERC20 = artifacts.require('ERC20Mock')

contract('GuardiansRegistry', ([_, something]) => {
  let controller, ANT

  const TOTAL_ACTIVE_BALANCE_LIMIT = bigExp(100e6, 18)

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy()
    ANT = await ERC20.new('ANT Token', 'ANT', 18)
  })

  describe('initialize', () => {
    context('when the initialization succeeds', () => {
      it('sets initial config correctly', async () => {
        const registry = await GuardiansRegistry.new(controller.address, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT)

        assert.equal(await registry.name(), 'Court Staked Aragon Network Token', 'registry "ERC20-lite" name does not match')
        assert.equal(await registry.symbol(), 'sANT', 'registry "ERC20-lite" symbol does not match')
        assert.equal(await registry.decimals(), 18, 'registry "ERC20-lite" decimals does not match')
        assert.equal(await registry.controller(), controller.address, 'registry controller does not match')
        assert.equal(await registry.guardiansToken(), ANT.address, 'guardian token address does not match')
        assertBn((await registry.totalActiveBalanceLimit()), TOTAL_ACTIVE_BALANCE_LIMIT, 'total active balance limit does not match')
      })
    })

    context('initialization fails', () => {
      context('when the given token address is the zero address', () => {
        const token = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(GuardiansRegistry.new(controller.address, token, TOTAL_ACTIVE_BALANCE_LIMIT), REGISTRY_ERRORS.NOT_CONTRACT)
        })
      })

      context('when the given token address is not a contract address', () => {
        const token = something

        it('reverts', async () => {
          await assertRevert(GuardiansRegistry.new(controller.address, token, TOTAL_ACTIVE_BALANCE_LIMIT), REGISTRY_ERRORS.NOT_CONTRACT)
        })
      })

      context('when the given total active balance limit is zero', () => {
        const totalActiveBalanceLimit = 0

        it('reverts', async () => {
          await assertRevert(GuardiansRegistry.new(controller.address, ANT.address, totalActiveBalanceLimit), REGISTRY_ERRORS.BAD_TOTAL_ACTIVE_BAL_LIMIT)
        })
      })

      context('when the given controller is the zero address', () => {
        const controllerAddress = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(GuardiansRegistry.new(controllerAddress, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })

      context('when the given controller is not a contract address', () => {
        const controllerAddress = something

        it('reverts', async () => {
          await assertRevert(GuardiansRegistry.new(controllerAddress, ANT.address, TOTAL_ACTIVE_BALANCE_LIMIT), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })
    })
  })
})
