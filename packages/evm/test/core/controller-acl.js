const { assertRevert, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { ACL_ERRORS } = require('../helpers/utils/errors')
const { ACL_EVENTS } = require('../helpers/utils/events')

contract('Controller', ([_, governor, someone]) => {
  let controller

  const ROLE = '0x0000000000000000000000000000000000000000000000000000000000000001'

  beforeEach('create controller', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor })
  })

  describe('grant', () => {
    context('when the sender is the governor', () => {
      const from = governor

      context('when the role was granted', () => {
        beforeEach('grant role', async () => {
          await controller.grant(ROLE, someone, { from })
        })

        context('when the role was frozen', () => {
          beforeEach('freeze role', async () => {
            await controller.freeze(ROLE, { from })
          })

          it('reverts', async () => {
            await assertRevert(controller.grant(ROLE, someone, { from }), ACL_ERRORS.ROLE_ALREADY_FROZEN)
          })
        })

        context('when the role was not frozen', () => {
          it('ignores the request', async () => {
            const receipt = await controller.grant(ROLE, someone, { from })

            assertAmountOfEvents(receipt, ACL_EVENTS.GRANTED, { expectedAmount: 0 })
          })
        })
      })

      context('when the role was not granted', () => {
        context('when the role was frozen', () => {
          beforeEach('freeze role', async () => {
            await controller.freeze(ROLE, { from })
          })

          it('reverts', async () => {
            await assertRevert(controller.grant(ROLE, someone, { from }), ACL_ERRORS.ROLE_ALREADY_FROZEN)
          })
        })

        context('when the role was not frozen', () => {
          it('grants the role', async () => {
            const receipt = await controller.grant(ROLE, someone, { from })

            assertAmountOfEvents(receipt, ACL_EVENTS.GRANTED)
            assertEvent(receipt, ACL_EVENTS.GRANTED, { expectedArgs: { who: someone, id: ROLE } })
          })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.grant(ROLE, someone, { from }), ACL_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('revoke', () => {
    context('when the sender is the governor', () => {
      const from = governor

      context('when the role was granted', () => {
        beforeEach('grant role', async () => {
          await controller.grant(ROLE, someone, { from })
        })

        context('when the role was frozen', () => {
          beforeEach('freeze role', async () => {
            await controller.freeze(ROLE, { from })
          })

          it('reverts', async () => {
            await assertRevert(controller.revoke(ROLE, someone, { from }), ACL_ERRORS.ROLE_ALREADY_FROZEN)
          })
        })

        context('when the role was not frozen', () => {
          it('revokes the role', async () => {
            const receipt = await controller.revoke(ROLE, someone, { from })

            assertAmountOfEvents(receipt, ACL_EVENTS.REVOKED)
            assertEvent(receipt, ACL_EVENTS.REVOKED, { expectedArgs: { who: someone, id: ROLE } })
          })
        })
      })

      context('when the role was not granted', () => {
        context('when the role was frozen', () => {
          beforeEach('freeze role', async () => {
            await controller.freeze(ROLE, { from })
          })

          it('reverts', async () => {
            await assertRevert(controller.revoke(ROLE, someone, { from }), ACL_ERRORS.ROLE_ALREADY_FROZEN)
          })
        })

        context('when the role was not frozen', () => {
          it('ignores the request', async () => {
            const receipt = await controller.revoke(ROLE, someone, { from })

            assertAmountOfEvents(receipt, ACL_EVENTS.REVOKED, { expectedAmount: 0 })
          })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.revoke(ROLE, someone, { from }), ACL_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('freeze', () => {
    context('when the sender is the governor', () => {
      const from = governor

      context('when the role was frozen', () => {
        beforeEach('freeze role', async () => {
          await controller.freeze(ROLE, { from })
        })

        it('reverts', async () => {
          await assertRevert(controller.freeze(ROLE, { from }), ACL_ERRORS.ROLE_ALREADY_FROZEN)
        })
      })

      context('when the role was not frozen', () => {
        it('freezes the role', async () => {
          const receipt = await controller.freeze(ROLE, { from })

          assertAmountOfEvents(receipt, ACL_EVENTS.FROZEN)
          assertEvent(receipt, ACL_EVENTS.FROZEN, { expectedArgs: { id: ROLE } })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.freeze(ROLE, { from }), ACL_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })
})
