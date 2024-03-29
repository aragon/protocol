const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const CRVoting = artifacts.require('CRVoting')

contract('CRVoting', ([_, someone]) => {
  let controller

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy()
  })

  describe('constructor', () => {
    context('when the initialization succeeds', () => {
      it('initializes voting correctly', async () => {
        const voting = await CRVoting.new(controller.address)

        assert.equal(await voting.controller(), controller.address, 'voting controller does not match')
      })
    })

    context('initialization fails', () => {
      context('when the given controller is the zero address', () => {
        const controllerAddress = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(CRVoting.new(controllerAddress), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })

      context('when the given controller is not a contract address', () => {
        const controllerAddress = someone

        it('reverts', async () => {
          await assertRevert(CRVoting.new(controllerAddress), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })
    })
  })
})
