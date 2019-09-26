const { bn, bigExp } = require('../helpers/numbers')
const { assertRevert } = require('../helpers/assertThrow')

const JurorsRegistry = artifacts.require('JurorsRegistry')
const ERC20 = artifacts.require('ERC20Mock')
const JurorsRegistryOwnerMock = artifacts.require('JurorsRegistryOwnerMock')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('JurorsRegistry', ([_, something]) => {
  let registry, registryOwner, ANJ

  const MIN_ACTIVE_AMOUNT = bigExp(100, 18)
  const TOTAL_ACTIVE_BALANCE_LIMIT = bn(1000)

  beforeEach('create base contracts', async () => {
    registry = await JurorsRegistry.new()
    registryOwner = await JurorsRegistryOwnerMock.new(registry.address)
    ANJ = await ERC20.new('ANJ Token', 'ANJ', 18)
  })

  describe('initialize', () => {
    context('when the registry is not initialized', () => {
      context('initialization fails', () => {
        context('when the given token address is the zero address', () => {
          const token = ZERO_ADDRESS

          it('reverts', async () => {
            await assertRevert(registry.init(registryOwner.address, token, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT), 'JR_NOT_CONTRACT')
          })
        })

        context('when the given token address is not a contract address', () => {
          const token = something

          it('reverts', async () => {
            await assertRevert(registry.init(registryOwner.address, token, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT), 'JR_NOT_CONTRACT')
          })
        })

        context('when the given total active balance limit is zero', () => {
          const totalActiveBalanceLimit = 0

          it('reverts', async () => {
            await assertRevert(registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, totalActiveBalanceLimit), 'JR_BAD_TOTAL_ACTIVE_BAL_LIMIT')
          })
        })

        // TODO: skipping these tests since we are currently initializing all the court dependencies from the
        //       court constructor. Will uncomment once we move that logic to a factory contract

        context.skip('when the given owner is the zero address', () => {
          const owner = ZERO_ADDRESS

          it('reverts', async () => {
            await assertRevert(registry.init(owner, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT), 'JR_NOT_CONTRACT')
          })
        })

        context.skip('when the given owner is not a contract address', () => {
          const owner = something

          it('reverts', async () => {
            await assertRevert(registry.init(owner, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT), 'JR_NOT_CONTRACT')
          })
        })
      })

      context('when the initialization succeeds', () => {
        context('when the minimum active amount is greater than zero', () => {
          const minActiveBalance = MIN_ACTIVE_AMOUNT

          it('is initialized', async () => {
            await registry.init(registryOwner.address, ANJ.address, minActiveBalance, TOTAL_ACTIVE_BALANCE_LIMIT)

            assert.isTrue(await registry.hasInitialized(), 'registry is not initialized')
          })
        })
      })
    })

    context('when it was already initialized', () => {
      beforeEach('initialize registry', async () => {
        await registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT)
      })

      it('reverts', async () => {
        await assertRevert(registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT), 'INIT_ALREADY_INITIALIZED')
      })
    })
  })

  describe('owner', () => {
    context('when the registry is initialized', () => {
      beforeEach('initialize registry', async () => {
        await registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT)
      })

      it('returns the owner address', async () => {
        assert.equal(await registry.owner(), registryOwner.address, 'owner address does not match')
      })
    })

    context('when the registry is not initialized', () => {
      it('returns the zero address', async () => {
        assert.equal(await registry.owner(), ZERO_ADDRESS, 'owner address does not match')
      })
    })
  })

  describe('token', () => {
    context('when the registry is initialized', () => {
      beforeEach('initialize registry', async () => {
        await registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT)
      })

      it('returns the owner address', async () => {
        assert.equal(await registry.token(), ANJ.address, 'token address does not match')
      })
    })

    context('when the registry is not initialized', () => {
      it('returns the zero address', async () => {
        assert.equal(await registry.token(), ZERO_ADDRESS, 'token address does not match')
      })
    })
  })

  describe('minActiveBalance', () => {
    context('when the registry is initialized', () => {
      beforeEach('initialize registry', async () => {
        await registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT)
      })

      it('returns the min active token amount', async () => {
        assert.equal((await registry.minJurorsActiveBalance()).toString(), MIN_ACTIVE_AMOUNT, 'min active token amount does not match')
      })
    })

    context('when the registry is not initialized', () => {
      it('returns zero', async () => {
        assert.equal((await registry.minJurorsActiveBalance()).toString(), 0, 'min active token amount does not match')
      })
    })
  })

  describe('supportsHistory', () => {
    context('when the registry is initialized', () => {
      beforeEach('initialize registry', async () => {
        await registry.init(registryOwner.address, ANJ.address, MIN_ACTIVE_AMOUNT, TOTAL_ACTIVE_BALANCE_LIMIT)
      })

      it('returns false', async () => {
        assert.isFalse(await registry.supportsHistory())
      })
    })

    context('when the registry is not initialized', () => {
      it('returns false', async () => {
        assert.isFalse(await registry.supportsHistory())
      })
    })
  })
})
