const abi = require('web3-eth-abi')
const { ecsign } = require('ethereumjs-util')
const { bn } = require('@aragon/contract-helpers-test')
const { keccak256, soliditySha3 } = require('web3-utils')
const { assertAmountOfEvents, assertEvent, assertRevert, assertBn } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { SIGNATURES_VALIDATOR_ERRORS } = require('../helpers/utils/errors')

const Relayed = artifacts.require('RelayedMock')
const Relayer = artifacts.require('RelayerMock')

contract('SignaturesValidator', ([_, sender, strange]) => {
  let relayer, module

  const wallet = web3.eth.accounts.create('erc3009')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

  const sign = message => {
    const { v, r, s } = ecsign(Buffer.from(message.replace('0x', ''), 'hex'), Buffer.from(externalAccountPK.replace('0x', ''), 'hex'))
    return { v, r: `0x${r.toString('hex')}`, s: `0x${s.toString('hex')}` }
  }

  before('deploy relayer and module', async () => {
    relayer = await Relayer.new()
    const controller = await buildHelper().deploy()
    await controller.updateRelayerWhitelist(relayer.address, true)
    module = await Relayed.new(controller.address)
  })

  describe('authenticate', () => {
    let user, deadline, nonce, allowedSender, allowedFunctionality

    const relay = async () => {
      const domainSeparator = await relayer.getDomainSeparator()
      const allowedDataABI = module.abi.find(i => i.name === allowedFunctionality)
      const allowedData = abi.encodeFunctionCall(allowedDataABI, [user])

      const encodedData = keccak256(abi.encodeParameters(
        ['address', 'address', 'bytes', 'address', 'uint256', 'uint256'],
        [relayer.address, module.address, allowedData, allowedSender, nonce, deadline])
      )

      const digest = soliditySha3(
        { type: 'bytes1', value: '0x19' },
        { type: 'bytes1', value: '0x01' },
        { type: 'bytes32', value: domainSeparator },
        { type: 'bytes32', value: encodedData }
      )

      const { v, r, s } = sign(digest)
      const dataABI = module.abi.find(i => i.name === 'authenticateCall')
      const data = abi.encodeFunctionCall(dataABI, [user])
      return relayer.relay(module.address, user, data, deadline, v, r, s, { from: sender })
    }

    const itReverts = () => {
      it('reverts', async () => {
        await assertRevert(relay(), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
      })
    }

    const itAllowsTheSender = () => {
      it('allows the sender', async () => {
        const previousNonce = await relayer.getNextNonce(user)

        const receipt = await relay()

        assertAmountOfEvents(receipt, 'Authenticated', { decodeForAbi: Relayed.abi })
        assertEvent(receipt, 'Authenticated', { decodeForAbi: Relayed.abi, expectedArgs: { user, sender: relayer.address } })

        const nextNonce = await relayer.getNextNonce(user)
        assertBn(nextNonce, user === sender ? previousNonce : previousNonce.add(bn(1)), 'next nonce does not match')
      })
    }

    const setUser = address => {
      beforeEach(`set user ${address}`, async () => {
        user = address
      })
    }

    const setAuthorizedSender = address => {
      beforeEach(`set authorized sender ${address}`, async () => {
        allowedSender = address
      })
    }

    const setAuthorizedFunctionality = fnName => {
      beforeEach(`set authorized functionality ${fnName}`, async () => {
        allowedFunctionality = fnName
      })
    }

    const setNonce = (offset = 0) => {
      beforeEach(`set nonce with offset ${offset}`, async () => {
        const nextNonce = await relayer.getNextNonce(user)
        nonce = nextNonce.add(bn(offset))
      })
    }

    const setDeadline = (offset = 0) => {
      beforeEach(`set deadline with offset ${offset}`, async () => {
        const currentTimestamp = await relayer.getTimestampExt()
        deadline = currentTimestamp.add(bn(offset))
      })
    }

    // TODO: need to access to the PK of one of the accounts set up
    context.skip('when the sender and the user are the same', () => {
      setUser(sender)

      context('when the signature allows the sender', () => {
        setAuthorizedSender(sender)

        context('when the given nonce is the next one', () => {
          setNonce(0)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })

        context('when the given nonce is a past one', () => {
          setNonce(-1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })

        context('when the given nonce is a future one', () => {
          setNonce(1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })
      })

      context('when the signature allows another sender', () => {
        setAuthorizedSender(strange)

        context('when the given nonce is the next one', () => {
          setNonce(0)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })

        context('when the given nonce is a past one', () => {
          setNonce(-1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })

        context('when the given nonce is a future one', () => {
          setNonce(1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-100)

              itAllowsTheSender()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itAllowsTheSender()
            })
          })
        })
      })
    })

    context('when the sender and the user are different accounts', () => {
      setUser(externalAccount)

      context('when the signature allows the sender', () => {
        setAuthorizedSender(sender)

        context('when the given nonce is the next one', () => {
          setNonce(0)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itAllowsTheSender()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itReverts()
            })
          })
        })

        context('when the given nonce is a past one', () => {
          setNonce(-1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itReverts()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itReverts()
            })
          })
        })

        context('when the given nonce is a future one', () => {
          setNonce(1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itReverts()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)
              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)
              itReverts()
            })
          })
        })
      })

      context('when the signature allows another sender', () => {
        setAuthorizedSender(strange)

        context('when the given nonce is the next one', () => {
          setNonce(0)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })
        })

        context('when the given nonce is a past one', () => {
          setNonce(-1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })
        })

        context('when the given nonce is a future one', () => {
          setNonce(1)

          context('when the authorized data is correct', () => {
            setAuthorizedFunctionality('authenticateCall')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })

          context('when the authorized functionality is not correct', () => {
            setAuthorizedFunctionality('anotherFunction')

            context('when the deadline is in the past', () => {
              setDeadline(-60 * 60)

              itReverts()
            })

            context('when the deadline is in the future', () => {
              setDeadline(60 * 60)

              itReverts()
            })
          })
        })
      })
    })
  })
})
