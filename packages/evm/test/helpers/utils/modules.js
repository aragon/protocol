const abi = require('web3-eth-abi')
const { ecsign } = require('ethereumjs-util')
const { MAX_UINT256 } = require('@aragon/contract-helpers-test')
const { sha3, keccak256, toHex, padLeft, soliditySha3 } = require('web3-utils')

const MODULE_IDS = {
  disputes: sha3('DISPUTE_MANAGER'),
  registry: sha3('GUARDIANS_REGISTRY'),
  voting: sha3('VOTING'),
  payments: sha3('PAYMENTS_BOOK'),
  treasury: sha3('TREASURY')
}

const sign = (message, pk) => {
  const { v, r, s } = ecsign(Buffer.from(message.replace('0x', ''), 'hex'), Buffer.from(pk.replace('0x', ''), 'hex'))
  return { v, r: `0x${r.toString('hex')}`, s: `0x${s.toString('hex')}` }
}

const encodeExtraCalldata = (calldata, deadline, { v, r, s }) => {
  const encodedDeadline = padLeft(toHex(deadline).slice(2), 64)
  const encodedV = padLeft(toHex(v).slice(2), 64)
  const encodedR = r.slice(2)
  const encodedS = s.slice(2)
  return `${calldata}${encodedDeadline}${encodedV}${encodedR}${encodedS}`
}

const encodeAuthorization = async (validator, user, userPK, calldata, sender, data = undefined, nonce = undefined, deadline = undefined) => {
  if (!data) data = calldata
  if (!nonce) nonce = await validator.getNextNonce(user)
  if (!deadline) deadline = MAX_UINT256

  const domainSeparator = await validator.getDomainSeparator()
  const encodedData = keccak256(abi.encodeParameters(
    ['bytes', 'address', 'uint256', 'uint256'],
    [data, sender, nonce, deadline]
  ))

  const digest = soliditySha3(
    { type: 'bytes1', value: '0x19' },
    { type: 'bytes1', value: '0x01' },
    { type: 'bytes32', value: domainSeparator },
    { type: 'bytes32', value: encodedData }
  )

  const signature = sign(digest, userPK)
  return encodeExtraCalldata(calldata, deadline, signature)
}

module.exports = {
  MODULE_IDS,
  sign,
  encodeExtraCalldata,
  encodeAuthorization
}
