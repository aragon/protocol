const { sha3 } = require('web3-utils')
const { ZERO_ADDRESS, ZERO_BYTES32, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertAmountOfEvents, assertEvent, assertBn } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { CONTROLLER_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')
const { CONTROLLER_EVENTS, CONTROLLED_EVENTS } = require('../helpers/utils/events')

const Controlled = artifacts.require('Controlled')
const ControlledMock = artifacts.require('ControlledMock')

contract('Controller', ([_, fundsGovernor, configGovernor, modulesGovernor, someone]) => {
  let controller

  beforeEach('create controller', async () => {
    controller = await buildHelper().deploy({ fundsGovernor, configGovernor, modulesGovernor })
  })

  describe('getFundsGovernor', () => {
    it('tells the expected governor', async () => {
      assert.equal(await controller.getFundsGovernor(), fundsGovernor, 'funds governor does not match')
    })
  })

  describe('getConfigGovernor', () => {
    it('tells the expected governor', async () => {
      assert.equal(await controller.getConfigGovernor(), configGovernor, 'config governor does not match')
    })
  })

  describe('getModulesGovernor', () => {
    it('tells the expected governor', async () => {
      assert.equal(await controller.getModulesGovernor(), modulesGovernor, 'modules governor does not match')
    })
  })

  describe('fundsConfigGovernor', () => {
    context('when the sender is the funds governor', () => {
      const from = fundsGovernor

      context('when the given address is not the zero address', () => {
        const newFundsGovernor = someone

        it('changes the funds governor', async () => {
          await controller.changeFundsGovernor(newFundsGovernor, { from })

          assert.equal(await controller.getFundsGovernor(), newFundsGovernor, 'funds governor does not match')
        })

        it('emits an event', async () => {
          const receipt = await controller.changeFundsGovernor(newFundsGovernor, { from })

          assertAmountOfEvents(receipt, CONTROLLER_EVENTS.FUNDS_GOVERNOR_CHANGED)
          assertEvent(receipt, CONTROLLER_EVENTS.FUNDS_GOVERNOR_CHANGED, { expectedArgs: { previousGovernor: fundsGovernor, currentGovernor: newFundsGovernor } })
        })
      })

      context('when the given address is the zero address', () => {
        const newFundsGovernor = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(controller.changeFundsGovernor(newFundsGovernor, { from }), CONTROLLER_ERRORS.INVALID_GOVERNOR_ADDRESS)
        })
      })
    })

    context('when the sender is not the funds governor', () => {
      const from = modulesGovernor

      it('reverts', async () => {
        await assertRevert(controller.changeFundsGovernor(someone, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('changeConfigGovernor', () => {
    context('when the sender is the config governor', () => {
      const from = configGovernor

      context('when the given address is not the zero address', () => {
        const newConfigGovernor = someone

        it('changes the config governor', async () => {
          await controller.changeConfigGovernor(newConfigGovernor, { from })

          assert.equal(await controller.getConfigGovernor(), newConfigGovernor, 'config governor does not match')
        })

        it('emits an event', async () => {
          const receipt = await controller.changeConfigGovernor(newConfigGovernor, { from })

          assertAmountOfEvents(receipt, CONTROLLER_EVENTS.CONFIG_GOVERNOR_CHANGED)
          assertEvent(receipt, CONTROLLER_EVENTS.CONFIG_GOVERNOR_CHANGED, { expectedArgs: { previousGovernor: configGovernor, currentGovernor: newConfigGovernor } })
        })
      })

      context('when the given address is the zero address', () => {
        const newConfigGovernor = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(controller.changeConfigGovernor(newConfigGovernor, { from }), CONTROLLER_ERRORS.INVALID_GOVERNOR_ADDRESS)
        })
      })
    })

    context('when the sender is not the config governor', () => {
      const from = modulesGovernor

      it('reverts', async () => {
        await assertRevert(controller.changeConfigGovernor(someone, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('changeModulesGovernor', () => {
    context('when the sender is the modules governor', () => {
      const from = modulesGovernor

      context('when the given address is not the zero address', () => {
        const newModulesGovernor = someone

        it('changes the modules governor', async () => {
          await controller.changeModulesGovernor(newModulesGovernor, { from })

          assert.equal(await controller.getModulesGovernor(), newModulesGovernor, 'modules governor does not match')
        })

        it('emits an event', async () => {
          const receipt = await controller.changeModulesGovernor(newModulesGovernor, { from })

          assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULES_GOVERNOR_CHANGED)
          assertEvent(receipt, CONTROLLER_EVENTS.MODULES_GOVERNOR_CHANGED, { expectedArgs: { previousGovernor: modulesGovernor, currentGovernor: newModulesGovernor } })
        })
      })

      context('when the given address is the zero address', () => {
        const newModulesGovernor = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(controller.changeModulesGovernor(newModulesGovernor, { from }), CONTROLLER_ERRORS.INVALID_GOVERNOR_ADDRESS)
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = configGovernor

      it('reverts', async () => {
        await assertRevert(controller.changeModulesGovernor(someone, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('ejectFundsGovernor', () => {
    context('when the sender is the funds governor', () => {
      const from = fundsGovernor

      it('removes the funds governor', async () => {
        await controller.ejectFundsGovernor({ from })

        assert.equal(await controller.getFundsGovernor(), ZERO_ADDRESS, 'funds governor does not match')
      })

      it('emits an event', async () => {
        const receipt = await controller.ejectFundsGovernor({ from })

        assertAmountOfEvents(receipt, CONTROLLER_EVENTS.FUNDS_GOVERNOR_CHANGED)
        assertEvent(receipt, CONTROLLER_EVENTS.FUNDS_GOVERNOR_CHANGED, { expectedArgs: { previousGovernor: fundsGovernor, currentGovernor: ZERO_ADDRESS } })
      })
    })

    context('when the sender is not the funds governor', () => {
      const from = configGovernor

      it('reverts', async () => {
        await assertRevert(controller.ejectModulesGovernor({ from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('ejectModulesGovernor', () => {
    context('when the sender is the modules governor', () => {
      const from = modulesGovernor

      it('removes the modules governor', async () => {
        await controller.ejectModulesGovernor({ from })

        assert.equal(await controller.getModulesGovernor(), ZERO_ADDRESS, 'modules governor does not match')
      })

      it('emits an event', async () => {
        const receipt = await controller.ejectModulesGovernor({ from })

        assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULES_GOVERNOR_CHANGED)
        assertEvent(receipt, CONTROLLER_EVENTS.MODULES_GOVERNOR_CHANGED, { expectedArgs: { previousGovernor: modulesGovernor, currentGovernor: ZERO_ADDRESS } })
      })
    })

    context('when the sender is not the modules governor', () => {
      const from = configGovernor

      it('reverts', async () => {
        await assertRevert(controller.ejectModulesGovernor({ from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('setModule', () => {
    context('when the sender is the governor', () => {
      const from = modulesGovernor

      context('when the given address is a contract', () => {
        let module

        beforeEach('deploy module', async () => {
          module = await Controlled.new(controller.address)
        })

        context('when the given id is an unknown ID', () => {
          const id = '0x0000000000000000000000000000000000000000000000000000000000000001'

          context('when the module was not set yet', () => {
            it('sets given module', async () => {
              const receipt = await controller.setModule(id, module.address, { from })

              const { addr, disabled } = await controller.getModule(id)
              assert.equal(addr, module.address, 'module address does not match')
              assert.isFalse(disabled, 'module is not enabled')

              assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_SET)
              assertEvent(receipt, CONTROLLER_EVENTS.MODULE_SET, { expectedArgs: { id, addr: module.address } })
            })
          })

          context('when the module was already set', () => {
            let previousModule

            beforeEach('set module', async () => {
              previousModule = await Controlled.new(controller.address)
              await controller.setModule(id, previousModule.address, { from })

              const { addr, disabled } = await controller.getModule(id)
              assert.equal(addr, previousModule.address, 'module address does not match')
              assert.isFalse(disabled, 'module is not enabled')
            })

            it('overwrites the previous address', async () => {
              const receipt = await controller.setModule(id, module.address, { from })

              const { addr, disabled } = await controller.getModule(id)
              assert.equal(addr, module.address, 'module address does not match')
              assert.isFalse(disabled, 'module is not enabled')

              assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_SET)
              assertEvent(receipt, CONTROLLER_EVENTS.MODULE_SET, { expectedArgs: { id, addr: module.address } })
            })
          })
        })

        context('when the given id is one of the known IDs', () => {
          const modules = [
            { name: 'DISPUTE_MANAGER', getter: 'getDisputeManager' },
            { name: 'GUARDIANS_REGISTRY', getter: 'getGuardiansRegistry' },
            { name: 'VOTING', getter: 'getVoting' },
            { name: 'PAYMENTS_BOOK', getter: 'getPaymentsBook' },
            { name: 'TREASURY', getter: 'getTreasury' }
          ]

          for (const { name, getter } of modules) {
            const id = sha3(name)

            describe(getter, () => {
              context('when the module was not set yet', () => {
                it('sets given module', async () => {
                  const receipt = await controller.setModule(id, module.address, { from })

                  const { addr, disabled } = await controller[getter]()
                  assert.equal(addr, module.address, 'module address does not match')
                  assert.isFalse(disabled, 'module is not enabled')

                  assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_SET)
                  assertEvent(receipt, CONTROLLER_EVENTS.MODULE_SET, { expectedArgs: { id, addr: module.address } })
                })
              })

              context('when the module was already set', () => {
                let previousModule, newModule

                beforeEach('set module', async () => {
                  previousModule = await Controlled.new(controller.address)
                  await controller.setModule(id, previousModule.address, { from })

                  const { addr, disabled } = await controller.getModule(id)
                  assert.equal(addr, previousModule.address, 'previous module address does not match')
                  assert.isFalse(disabled, 'previous module is not enabled')

                  newModule = await Controlled.new(controller.address)
                })

                it('overwrites the previous implementation', async () => {
                  const receipt = await controller.setModule(id, newModule.address, { from })

                  const { addr, disabled } = await controller[getter]()
                  assert.equal(addr, newModule.address, 'new module address does not match')
                  assert.isFalse(disabled, 'new module is not enabled')

                  assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_SET)
                  assertEvent(receipt, CONTROLLER_EVENTS.MODULE_SET, { expectedArgs: { id, addr: newModule.address } })
                })
              })
            })
          }
        })
      })

      context('when the given address is not a contract', () => {
        const module = someone

        it('reverts', async () => {
          await assertRevert(controller.setModule('0x0', module, { from }), CONTROLLER_ERRORS.IMPLEMENTATION_NOT_CONTRACT)
        })
      })

      context('when the given address is the zero address', () => {
        const module = ZERO_ADDRESS

        it('reverts', async () => {
          await assertRevert(controller.setModule('0x0', module, { from }), CONTROLLER_ERRORS.IMPLEMENTATION_NOT_CONTRACT)
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.setModule('0x0', ZERO_ADDRESS, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('disableModule', () => {
    let module
    const ID = '0x0000000000000000000000000000000000000000000000000000000000000001'

    beforeEach('deploy module', async () => {
      module = await Controlled.new(controller.address)
    })

    context('when the sender is the governor', () => {
      const from = modulesGovernor

      const itDisablesTheModule = () => {
        it('disables the module', async () => {
          const receipt = await controller.disableModule(module.address, { from })

          const { id, disabled } = await controller.getModuleByAddress(module.address)
          assert.equal(id, ID, 'module ID does not match')
          assert.isTrue(disabled, 'module is not disabled')

          assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_DISABLED)
          assertEvent(receipt, CONTROLLER_EVENTS.MODULE_DISABLED, { expectedArgs: { id, addr: module.address } })
        })
      }

      context('when the given address was not registered yet', () => {
        it('reverts', async () => {
          await assertRevert(controller.disableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_NOT_SET)
        })
      })

      context('when the given address was already registered', () => {
        beforeEach('register module', async () => {
          await controller.setModule(ID, module.address, { from })
        })

        context('when the given address is the current module', () => {
          context('when the given address was not disabled yet', () => {
            itDisablesTheModule()
          })

          context('when the given address was already disabled', () => {
            beforeEach('disable module', async () => {
              await controller.disableModule(module.address, { from })
            })

            it('reverts', async () => {
              await assertRevert(controller.disableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_ALREADY_DISABLED)
            })
          })
        })

        context('when the given address is not the current module', () => {
          let newModule

          beforeEach('register new module', async () => {
            newModule = await Controlled.new(controller.address)
            await controller.setModule(ID, newModule.address, { from })
          })

          const itDoesNotAffectTheCurrentModule = () => {
            it('does not affect the current module', async () => {
              assert.isTrue(await controller.isActive(ID, newModule.address), 'current module is not active')
            })
          }

          context('when the given address was not disabled yet', () => {
            itDisablesTheModule()
            itDoesNotAffectTheCurrentModule()
          })

          context('when the given address was already disabled', () => {
            beforeEach('disable module', async () => {
              await controller.disableModule(module.address, { from })
            })

            it('reverts', async () => {
              await assertRevert(controller.disableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_ALREADY_DISABLED)
            })

            itDoesNotAffectTheCurrentModule()
          })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.disableModule(ZERO_ADDRESS, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('enableModule', () => {
    let module
    const ID = '0x0000000000000000000000000000000000000000000000000000000000000002'

    beforeEach('deploy module', async () => {
      module = await Controlled.new(controller.address)
    })

    context('when the sender is the governor', () => {
      const from = modulesGovernor

      const itEnablesTheModule = () => {
        it('enables the module', async () => {
          const receipt = await controller.enableModule(module.address, { from })

          const { id, disabled } = await controller.getModuleByAddress(module.address)
          assert.equal(ID, id, 'module ID does not match')
          assert.isFalse(disabled, 'module is not enabled')

          assertAmountOfEvents(receipt, CONTROLLER_EVENTS.MODULE_ENABLED)
          assertEvent(receipt, CONTROLLER_EVENTS.MODULE_ENABLED, { expectedArgs: { id, addr: module.address } })
        })
      }

      context('when the given address was not registered yet', () => {
        it('reverts', async () => {
          await assertRevert(controller.enableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_NOT_SET)
        })
      })

      context('when the given address was already registered', () => {
        beforeEach('register module', async () => {
          await controller.setModule(ID, module.address, { from })
        })

        context('when the given address is the current module', () => {
          context('when the given address was already enabled', () => {
            it('reverts', async () => {
              await assertRevert(controller.enableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_ALREADY_ENABLED)
            })
          })

          context('when the given address was disabled', () => {
            beforeEach('disable module', async () => {
              await controller.disableModule(module.address, { from })
            })

            itEnablesTheModule()
          })
        })

        context('when the given address is not the current module', () => {
          let newModule

          beforeEach('register new module', async () => {
            newModule = await Controlled.new(controller.address)
            await controller.setModule(ID, newModule.address, { from })
          })

          const itDoesNotAffectTheCurrentModule = () => {
            it('does not affect the current module', async () => {
              assert.isTrue(await controller.isActive(ID, newModule.address), 'current module is not active')
            })
          }

          context('when the given address was already enabled', () => {
            itDoesNotAffectTheCurrentModule()

            it('reverts', async () => {
              await assertRevert(controller.enableModule(module.address, { from }), CONTROLLER_ERRORS.MODULE_ALREADY_ENABLED)
            })
          })

          context('when the given address was disabled', () => {
            beforeEach('disable module', async () => {
              await controller.disableModule(module.address, { from })
            })

            itEnablesTheModule()
            itDoesNotAffectTheCurrentModule()
          })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.enableModule(ZERO_ADDRESS, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })

  describe('cacheModules', () => {
    let firstModule, secondModule, thirdModule
    const firstID = '0x0000000000000000000000000000000000000000000000000000000000000001'
    const secondID = '0x0000000000000000000000000000000000000000000000000000000000000002'
    const thirdID = '0x0000000000000000000000000000000000000000000000000000000000000003'

    beforeEach('deploy module', async () => {
      firstModule = await Controlled.new(controller.address)
      secondModule = await Controlled.new(controller.address)
      thirdModule = await Controlled.new(controller.address)
    })

    context('when the sender is the governor', () => {
      const from = modulesGovernor

      context('when the given input length is valid', () => {
        const IDs = [firstID, secondID, thirdID]

        context('when all the given modules where set', () => {
          beforeEach('set all modules', async () => {
            controller.setModules(IDs, [firstModule.address, secondModule.address, thirdModule.address], [], [], { from: modulesGovernor })
          })

          it('caches the requested modules in the requested targets', async () => {
            const targets = [secondModule.address, thirdModule.address]
            const receipt = await controller.cacheModules(targets, IDs, { from })

            assertAmountOfEvents(receipt, CONTROLLED_EVENTS.MODULE_CACHED, { expectedAmount: 6, decodeForAbi: Controlled.abi })
            assertEvent(receipt, CONTROLLED_EVENTS.MODULE_CACHED, { index: 0, expectedArgs: { id: IDs[0], addr: firstModule.address }, decodeForAbi: Controlled.abi })
            assertEvent(receipt, CONTROLLED_EVENTS.MODULE_CACHED, { index: 1, expectedArgs: { id: IDs[1], addr: secondModule.address }, decodeForAbi: Controlled.abi })
            assertEvent(receipt, CONTROLLED_EVENTS.MODULE_CACHED, { index: 2, expectedArgs: { id: IDs[2], addr: thirdModule.address }, decodeForAbi: Controlled.abi })
          })

          it('it does not affect when the modules are updated', async () => {
            const targets = [secondModule.address, thirdModule.address]
            await controller.cacheModules(targets, IDs, { from })

            const newFirstModule = await Controlled.new(controller.address)
            await controller.setModule(firstID, newFirstModule.address, { from })

            assert.equal(await firstModule.modulesCache(firstID), ZERO_ADDRESS, 'first module cache for first module does not match')
            assert.equal(await firstModule.modulesCache(secondID), ZERO_ADDRESS, 'second module cache for second module does not match')
            assert.equal(await firstModule.modulesCache(thirdID), ZERO_ADDRESS, 'third module cache for third module does not match')

            assert.equal(await secondModule.modulesCache(firstID), firstModule.address, 'first module cache for first module does not match')
            assert.equal(await secondModule.modulesCache(secondID), secondModule.address, 'second module cache for second module does not match')
            assert.equal(await secondModule.modulesCache(thirdID), thirdModule.address, 'third module cache for third module does not match')

            assert.equal(await thirdModule.modulesCache(firstID), firstModule.address, 'first module cache for first module does not match')
            assert.equal(await thirdModule.modulesCache(secondID), secondModule.address, 'second module cache for second module does not match')
            assert.equal(await thirdModule.modulesCache(thirdID), thirdModule.address, 'third module cache for third module does not match')
          })
        })

        context('when not all the given modules where set', () => {
          beforeEach('set one module', async () => {
            await controller.setModule(firstID, firstModule.address, { from: modulesGovernor })
          })

          it('reverts', async () => {
            await assertRevert(controller.cacheModules([firstModule.address], IDs, { from }), CONTROLLER_ERRORS.MODULE_NOT_SET)
          })
        })
      })

      context('when the given input length is not valid', () => {
        it('reverts', async () => {
          await assertRevert(controller.cacheModules([ZERO_ADDRESS], [], { from }), CONTROLLER_ERRORS.INVALID_IMPLS_INPUT_LENGTH)
          await assertRevert(controller.cacheModules([], [ZERO_BYTES32], { from }), CONTROLLER_ERRORS.INVALID_IMPLS_INPUT_LENGTH)
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.cacheModules([ZERO_ADDRESS], [ZERO_BYTES32], { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })

    context('when trying to call it directly', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(firstModule.cacheModules([firstID], [firstModule.address], { from }), CONTROLLED_ERRORS.SENDER_NOT_CONTROLLER)
      })
    })
  })

  describe('customFunctions', () => {
    let module

    const setCounterSig = sha3('setCounter(uint256)').slice(0, 10)
    const receiveEtherSig = sha3('receiveEther()').slice(0, 10)
    const failSig = sha3('fail()').slice(0, 10)

    beforeEach('deploy module', async () => {
      module = await ControlledMock.new(controller.address)
    })

    context('when the sender is the governor', () => {
      const from = modulesGovernor

      context('when setting a function', () => {
        const itRegistersTheCustomFunction = () => {
          it('sets the function', async () => {
            const receipt = await controller.setCustomFunction(setCounterSig, module.address, { from })
            assertAmountOfEvents(receipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET)
            assertEvent(receipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET, { signature: setCounterSig, target: module.address })

            const anotherReceipt = await controller.setCustomFunction(receiveEtherSig, module.address, { from })
            assertAmountOfEvents(anotherReceipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET)
            assertEvent(anotherReceipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET, { signature: setCounterSig, target: module.address })
          })

          it('can be called', async () => {
            const data = module.contract.methods.setCounter(10).encodeABI()
            await controller.setCustomFunction(setCounterSig, module.address, { from })

            assertBn(await module.counter(), 0, 'counter does not match')
            await controller.sendTransaction({ data })
            assertBn(await module.counter(), 10, 'counter does not match')
          })

          it('handles eth transfers properly', async () => {
            await controller.setCustomFunction(receiveEtherSig, module.address, { from })

            const receipt = await controller.sendTransaction({ data: receiveEtherSig, value: bigExp(1, 18) })

            assertAmountOfEvents(receipt, 'EtherReceived', { decodeForAbi: ControlledMock.abi })
            assertEvent(receipt, 'EtherReceived', { expectedArgs: { sender: controller.address, value: bigExp(1, 18) }, decodeForAbi: ControlledMock.abi })

            const currentBalance = await web3.eth.getBalance(module.address)
            assertBn(currentBalance, bigExp(1, 18), 'module balance does not match')
          })

          it('handles reverts properly', async () => {
            await controller.setCustomFunction(failSig, module.address, { from })

            await assertRevert(controller.sendTransaction({ data: failSig }), 'CONTROLLED_FAIL')
          })
        }

        context('when the function was not set', () => {
          itRegistersTheCustomFunction()
        })

        context('when the function was already set', () => {
          beforeEach('set custom function', async () => {
            await controller.setCustomFunction(failSig, modulesGovernor, { from })
            await controller.setCustomFunction(setCounterSig, modulesGovernor, { from })
            await controller.setCustomFunction(receiveEtherSig, modulesGovernor, { from })
          })

          itRegistersTheCustomFunction()
        })
      })

      context('when unsetting a function', () => {
        const itUnregistersTheCustomFunction = () => {
          it('unsets the function', async () => {
            const receipt = await controller.setCustomFunction(setCounterSig, ZERO_ADDRESS, { from })
            assertAmountOfEvents(receipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET)
            assertEvent(receipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET, { signature: setCounterSig, target: ZERO_ADDRESS })

            const anotherReceipt = await controller.setCustomFunction(receiveEtherSig, ZERO_ADDRESS, { from })
            assertAmountOfEvents(anotherReceipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET)
            assertEvent(anotherReceipt, CONTROLLER_EVENTS.CUSTOM_FUNCTION_SET, { signature: setCounterSig, target: ZERO_ADDRESS })
          })

          it('cannot be called', async () => {
            const data = module.contract.methods.setCounter(10).encodeABI()
            await controller.setCustomFunction(setCounterSig, ZERO_ADDRESS, { from })

            await assertRevert(controller.sendTransaction({ data }), CONTROLLER_ERRORS.CUSTOM_FUNCTION_NOT_SET)
          })
        }

        context('when the function was not set', () => {
          itUnregistersTheCustomFunction()
        })

        context('when the function was already set', () => {
          beforeEach('set custom function', async () => {
            await controller.setCustomFunction(failSig, modulesGovernor, { from })
            await controller.setCustomFunction(setCounterSig, modulesGovernor, { from })
            await controller.setCustomFunction(receiveEtherSig, modulesGovernor, { from })
          })

          itUnregistersTheCustomFunction()
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(controller.setCustomFunction(setCounterSig, ZERO_ADDRESS, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })
})
