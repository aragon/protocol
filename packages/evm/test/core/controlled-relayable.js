const { assertAmountOfEvents, assertEvent, assertRevert } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const Relayed = artifacts.require('RelayedMock')
const Relayer = artifacts.require('RelayerMock')

contract('ControlledRelayable', ([_, user, someone]) => {
  let relayer, module

  before('deploy relayer and module', async () => {
    relayer = await Relayer.new()
    const controller = await buildHelper().deploy()
    await controller.updateRelayerWhitelist(relayer.address, true)
    module = await Relayed.new(controller.address)
  })

  describe('relay', () => {
    context('when the sender is the relayer', () => {
      const itAllowsTheCall = from => {
        it('allows the call', async () => {
          const data = module.contract.methods.authenticateCall(user).encodeABI()
          const receipt = await relayer.relay(module.address, data, { from })

          assertAmountOfEvents(receipt, 'Authenticated', { decodeForAbi: Relayed.abi })
          assertEvent(receipt, 'Authenticated', { decodeForAbi: Relayed.abi, expectedArgs: { user, sender: relayer.address } })
        })
      }

      context('when the caller is the user', () => {
        const from = user

        itAllowsTheCall(from)
      })

      context('when the caller is the someone else', () => {
        const from = user

        itAllowsTheCall(from)
      })
    })

    context('when the sender is not the relayer', () => {
      context('when the sender is the given user', () => {
        const from = user

        it('allows the call', async () => {
          const receipt = await module.authenticateCall(user, { from })

          assertAmountOfEvents(receipt, 'Authenticated')
          assertEvent(receipt, 'Authenticated', { expectedArgs: { user, sender: from } })
        })
      })

      context('when the sender is not the given user', () => {
        const from = someone

        it('reverts', async () => {
          await assertRevert(module.authenticateCall(user, { from }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })
})
