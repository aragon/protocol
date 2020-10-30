const abi = require('web3-eth-abi')
const { ecsign } = require('ethereumjs-util')
const { bn, ZERO_BYTES32 } = require('@aragon/contract-helpers-test')
const { keccak256, toHex, padLeft, soliditySha3 } = require('web3-utils')
const { assertAmountOfEvents, assertEvent, assertRevert, assertBn } = require('@aragon/contract-helpers-test/src/asserts')

const { SIGNATURES_VALIDATOR_ERRORS } = require('../helpers/utils/errors')

const SignaturesValidator = artifacts.require('SignaturesValidatorMock')

contract('SignaturesValidator', ([_, sender, strange]) => {
  let validator
  const wallet = web3.eth.accounts.create('erc3009')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

  const sign = message => {
    const { v, r, s } = ecsign(Buffer.from(message.replace('0x', ''), 'hex'), Buffer.from(externalAccountPK.replace('0x', ''), 'hex'))
    return { v, r: `0x${r.toString('hex')}`, s: `0x${s.toString('hex')}` }
  }

  const encodeSignature = (calldata, deadline, { v, r, s }) => {
    const encodedDeadline = padLeft(toHex(deadline).slice(2), 64)
    const encodedV = padLeft(toHex(v).slice(2), 64)
    const encodedR = r.slice(2)
    const encodedS = s.slice(2)
    return `${calldata}${encodedDeadline}${encodedV}${encodedR}${encodedS}`
  }

  before('deploy validator', async () => {
    validator = await SignaturesValidator.new()
  })

  describe('decoding', () => {
    const calldata = abi.encodeFunctionSignature('decodeCalldata()')

    context('when there is no signature encoded', () => {
      it('decodes empty data', async () => {
        const receipt = await validator.sendTransaction({ data: calldata, from: sender })

        assertAmountOfEvents(receipt, 'CalldataDecoded')
        assertEvent(receipt, 'CalldataDecoded', { expectedArgs: { data: calldata, deadline: 0, v: 0, r: ZERO_BYTES32, s: ZERO_BYTES32 } })
      })
    })

    context('when there is a signature encoded', () => {
      const deadline = 15

      it('decodes it properly', async () => {
        const signature = sign(soliditySha3('message'))
        const calldataWithSignature = encodeSignature(calldata, deadline, signature)

        const receipt = await validator.sendTransaction({ data: calldataWithSignature, from: sender })

        const { v, r, s } = signature
        assertAmountOfEvents(receipt, 'CalldataDecoded')
        assertEvent(receipt, 'CalldataDecoded', { expectedArgs: { data: calldata, deadline, v, r, s } })
      })
    })
  })

  describe('authenticate', () => {
    let user, deadline, nonce, allowedSender, allowedFunctionality

    before('mock nonces', async () => {
      await validator.increaseNonce(externalAccount)
      await validator.increaseNonce(sender)
    })

    const itReverts = (extraCalldata = undefined) => {
      it('reverts', async () => {
        const data = await encodeCalldata(extraCalldata)
        await assertRevert(validator.sendTransaction({ from: sender, data }), SIGNATURES_VALIDATOR_ERRORS.INVALID_SIGNATURE)
      })
    }

    const itAllowsTheSender = (extraCalldata = undefined) => {
      it('allows the sender', async () => {
        const previousNonce = await validator.getNextNonce(user)

        const data = await encodeCalldata(extraCalldata)
        const receipt = await validator.sendTransaction({ from: sender, data })

        assertAmountOfEvents(receipt, 'Authenticated')
        assertEvent(receipt, 'Authenticated', { expectedArgs: { user, sender } })

        const nextNonce = await validator.getNextNonce(user)
        assertBn(nextNonce, user === sender ? previousNonce : previousNonce.add(bn(1)), 'next nonce does not match')
      })
    }

    const encodeCalldata = async (extraCalldata = undefined) => {
      const ABI = validator.abi.find(i => i.name === 'authenticateCall')
      const calldata = abi.encodeFunctionCall(ABI, [user])
      return extraCalldata === undefined ? encodeExtraCalldata(calldata) : `${calldata}${extraCalldata}`
    }

    const encodeExtraCalldata = async (calldata) => {
      const domainSeparator = await validator.getDomainSeparator()
      const ABI = validator.abi.find(i => i.name === allowedFunctionality)
      const allowedData = abi.encodeFunctionCall(ABI, [user])
      const encodedData = keccak256(abi.encodeParameters(['bytes', 'address', 'uint256', 'uint256'], [allowedData, allowedSender, nonce, deadline]))

      const digest = soliditySha3(
        { type: 'bytes1', value: '0x19' },
        { type: 'bytes1', value: '0x01' },
        { type: 'bytes32', value: domainSeparator },
        { type: 'bytes32', value: encodedData }
      )

      const signature = sign(digest)
      return encodeSignature(calldata, deadline, signature)
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
        const nextNonce = await validator.getNextNonce(user)
        nonce = nextNonce.add(bn(offset))
      })
    }

    const setDeadline = (offset = 0) => {
      beforeEach(`set deadline with offset ${offset}`, async () => {
        const currentTimestamp = await validator.getTimestampExt()
        deadline = currentTimestamp.add(bn(offset))
      })
    }

    context('when there is no extra calldata given', () => {
      const extraCalldata = ''

      context('when there sender and the user are the same', () => {
        setUser(sender)
        itAllowsTheSender(extraCalldata)
      })

      context('when there sender and the user are different accounts', () => {
        setUser(externalAccount)
        itReverts(extraCalldata)
      })
    })

    context('when there is some extra calldata given', () => {
      context('when the sender and the user are the same', () => {
        setUser(sender)

        context('when the extra calldata is malformed', () => {
          const extraCalldata = 'abcd'

          itAllowsTheSender(extraCalldata)
        })

        context('when the extra calldata is well formed', () => {
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
      })

      context('when the sender and the user are different accounts', () => {
        setUser(externalAccount)

        context('when the extra calldata is malformed', () => {
          const extraCalldata = 'abcd'

          itReverts(extraCalldata)
        })

        context('when the extra calldata is properly encoded', () => {
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
  })
})
