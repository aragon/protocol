const abi = require('web3-eth-abi')
const { bn } = require('@aragon/contract-helpers-test')
const { keccak256, soliditySha3 } = require('web3-utils')

const OUTCOMES = {
  MISSING: bn(0),
  LEAKED: bn(1),
  REFUSED: bn(2),
  LOW: bn(3),
  HIGH: bn(4)
}

const SALT = soliditySha3('passw0rd')

const hashVote = (outcome, salt = SALT) => {
  return soliditySha3({ t: 'uint8', v: outcome }, { t: 'bytes32', v: salt })
}

const getVoteId = (disputeId, roundId) => {
  return bn(2).pow(bn(128)).mul(bn(disputeId)).add(bn(roundId))
}

const outcomeFor = (n) => {
  return n % 2 === 0 ? OUTCOMES.LOW : OUTCOMES.HIGH
}

const oppositeOutcome = outcome => {
  return outcome.eq(OUTCOMES.LOW) ? OUTCOMES.HIGH : OUTCOMES.LOW
}

const COMMIT_WITH_SIG_TYPEHASH = keccak256('CommitWithSig(uint256 voteId,address voter,address representative)')

async function createRepresetativeAuthorization(voting, voteId, voter, representative) {
  const domainSeparator = await voting.getDomainSeparator()
  return soliditySha3(
    { type: 'bytes1', value: '0x19' },
    { type: 'bytes1', value: '0x01' },
    { type: 'bytes32', value: domainSeparator },
    { type: 'bytes32',
      value:
      keccak256(
        abi.encodeParameters(
          ['bytes32', 'uint256', 'address', 'address'],
          [COMMIT_WITH_SIG_TYPEHASH, voteId, voter, representative]
        )
      )
    }
  )
}

module.exports = {
  SALT,
  OUTCOMES,
  hashVote,
  getVoteId,
  outcomeFor,
  oppositeOutcome,
  createRepresetativeAuthorization,
  COMMIT_WITH_SIG_TYPEHASH
}
