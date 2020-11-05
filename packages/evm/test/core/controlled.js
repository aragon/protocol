const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { roleId } = require('../helpers/utils/modules')
const { buildHelper } = require('../helpers/wrappers/protocol')
const { CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const Controlled = artifacts.require('ControlledMock')

contract('Controlled', ([_, user, fundsGovernor, configGovernor, modulesGovernor, someone]) => {
  let controller, controlled

  beforeEach('create controlled', async () => {
    controller = await buildHelper().deploy({ fundsGovernor, configGovernor, modulesGovernor })
    controlled = await Controlled.new(controller.address)
  })

  describe('constructor', () => {
    context('when the initialization succeeds', () => {
      it('initializes the controlled', async () => {
        controlled = await Controlled.new(controller.address)

        assert.equal(await controlled.controller(), controller.address, 'controller does not match')
      })
    })

    context('when the initialization fails', () => {
      context('when the given controller is not a contract', () => {
        const controllerAddress = someone

        it('reverts', async () => {
          await assertRevert(Controlled.new(controllerAddress), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })

      context('when the given controller is the zero address', () => {
        const controllerAddress = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(Controlled.new(controllerAddress), CONTROLLED_ERRORS.CONTROLLER_NOT_CONTRACT)
        })
      })
    })
  })

  describe('onlyConfigGovernor', () => {
    context('when the sender is the governor', () => {
      const from = configGovernor

      it('executes call', async () => {
        const receipt = await controlled.onlyConfigGovernorFn({ from })

        assertAmountOfEvents(receipt, 'OnlyConfigGovernorCalled')
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controlled.onlyConfigGovernorFn({ from }), CONTROLLED_ERRORS.SENDER_NOT_CONFIG_GOVERNOR)
      })
    })
  })

  describe('authenticateSender', () => {
    const itAllowsTheCall = from => {
      it('allows the call', async () => {
        const receipt = await controlled.authenticateCall(user, { from })

        assertAmountOfEvents(receipt, 'Authenticated')
        assertEvent(receipt, 'Authenticated', { expectedArgs: { user, sender: from } })
      })
    }

    context('when the sender is the user', () => {
      const from = user

      itAllowsTheCall(from)
    })

    context('when the sender is not the user', () => {
      const from = someone

      context('when the sender is authorized', () => {
        beforeEach('grant permission', async () => {
          await controller.grant(roleId(controlled.address), 'authenticateCall', from, { from: configGovernor })
        })

        itAllowsTheCall(from)
      })

      context('when the sender is not authorized', () => {
        beforeEach('revoke permission', async () => {
          await controller.revoke(roleId(controlled.address, 'authenticateCall'), from, { from: configGovernor })
        })

        it('reverts', async () => {
          await assertRevert(controlled.authenticateCall(user, { from }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })
})
