const { bn } = require('@aragon/contract-helpers-test')
const { soliditySha3, toBN } = require('web3-utils')

const expectedBounds = ({ selectedGuardians, batchRequestedGuardians, balances, totalRequestedGuardians }) => {
  const totalBalance = balances.reduce((total, balance) => total.add(balance), bn(0))

  const expectedLowBound = bn(selectedGuardians).mul(bn(totalBalance)).div(bn(totalRequestedGuardians))
  const expectedHighBound = bn(selectedGuardians).add(bn(batchRequestedGuardians)).mul(bn(totalBalance)).div(bn(totalRequestedGuardians))
  return { expectedLowBound, expectedHighBound }
}

const simulateComputeSearchRandomBalances = ({
  termRandomness,
  disputeId,
  sortitionIteration,
  batchRequestedGuardians,
  lowActiveBalanceBatchBound,
  highActiveBalanceBatchBound
}) => {
  let expectedSumTreeBalances = []
  const interval = highActiveBalanceBatchBound.sub(lowActiveBalanceBatchBound)
  for (let i = 0; i < batchRequestedGuardians; i++) {
    if (interval.eq(bn(0))) expectedSumTreeBalances.push(lowActiveBalanceBatchBound)
    else {
      const seed = soliditySha3(termRandomness, disputeId, sortitionIteration, i)
      const balance = bn(lowActiveBalanceBatchBound).add(toBN(seed).mod(interval))
      expectedSumTreeBalances.push(balance)
    }
  }

  return expectedSumTreeBalances.sort((x, y) => x.lt(y) ? -1 : 1)
}

const simulateBatchedRandomSearch = ({
  termRandomness,
  disputeId,
  selectedGuardians,
  batchRequestedGuardians,
  roundRequestedGuardians,
  sortitionIteration,
  balances,
  getTreeKey
}) => {
  const { expectedLowBound, expectedHighBound } = expectedBounds({
    selectedGuardians,
    batchRequestedGuardians,
    balances,
    totalRequestedGuardians: roundRequestedGuardians
  })

  const expectedSumTreeBalances = simulateComputeSearchRandomBalances({
    termRandomness,
    disputeId,
    sortitionIteration,
    batchRequestedGuardians,
    lowActiveBalanceBatchBound: expectedLowBound,
    highActiveBalanceBatchBound: expectedHighBound
  })

  // as guardians balances are sequential 0 to n, ids and values are the same
  return expectedSumTreeBalances
    .map(balance => getTreeKey(balances, balance))
    .filter(key => key !== undefined)
}

const simulateDraft = ({
  termRandomness,
  disputeId,
  selectedGuardians,
  batchRequestedGuardians,
  roundRequestedGuardians,
  sortitionIteration,
  guardians,
  draftLockAmount,
  getTreeKey
}) => {
  const balances = guardians.map(guardian => guardian.activeBalance)

  const MAX_ITERATIONS = 10
  let draftedKeys = []
  let iteration = sortitionIteration
  let guardiansLeft = batchRequestedGuardians

  while (guardiansLeft > 0 && iteration < MAX_ITERATIONS) {
    const iterationDraftedKeys = simulateBatchedRandomSearch({
      termRandomness,
      disputeId,
      selectedGuardians,
      batchRequestedGuardians,
      roundRequestedGuardians,
      sortitionIteration: iteration,
      balances,
      getTreeKey
    })

    // remove locked guardians
    const filteredIterationDraftedKeys = iterationDraftedKeys
      .filter(key => {
        const { unlockedActiveBalance } = guardians[key]
        const enoughBalance = unlockedActiveBalance.gte(draftLockAmount)
        if (enoughBalance) guardians[key].unlockedActiveBalance = unlockedActiveBalance.sub(draftLockAmount)
        return enoughBalance
      })
      .slice(0, guardiansLeft)

    iteration++
    guardiansLeft -= filteredIterationDraftedKeys.length
    draftedKeys = draftedKeys.concat(filteredIterationDraftedKeys)
  }

  return draftedKeys.map(key => guardians[key].address)
}

module.exports = {
  expectedBounds,
  simulateComputeSearchRandomBalances,
  simulateBatchedRandomSearch,
  simulateDraft
}
