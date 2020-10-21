const { bn } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn } = require('@aragon/contract-helpers-test/src/asserts')

const { TREE_ERRORS } = require('../helpers/utils/errors')
const { expectedBounds, simulateComputeSearchRandomBalances, simulateBatchedRandomSearch } = require('../helpers/utils/registry')

const GuardiansTreeSortition = artifacts.require('GuardiansTreeSortitionMock')

contract('GuardiansTreeSortition', () => {
  let tree

  // as guardians balances are sequential 0 to n, tree sum at position k is k(k+1)/2
  const getTreeKey = (balances, soughtBalance) => {
    return Math.ceil((Math.sqrt(1 + 8 * soughtBalance.toNumber()) - 1) / 2)
  }

  beforeEach('create tree', async () => {
    tree = await GuardiansTreeSortition.new()
    await tree.init()
  })

  describe('getSearchBatchBounds', () => {
    const termId = 2
    const totalRequestedGuardians = 5
    const balances = [ 1, 2, 5, 3, 1 ].map(x => bn(x))

    context('when there are no balances in the tree', () => {
      const selectedGuardians = 0
      const batchRequestedGuardians = 5

      it('returns zeroed values', async () => {
        const { low, high } = await tree.getSearchBatchBounds(termId, selectedGuardians, batchRequestedGuardians, totalRequestedGuardians)

        assertBn(low, 0, 'low bound does not match')
        assertBn(high, 0, 'high bound does not match')
      })
    })

    context('when there are some balances in the tree', () => {
      beforeEach('insert guardians active balances', async () => {
        await Promise.all(balances.map(b => tree.insert(termId, b)))
      })

      context('when querying a first batch', async () => {
        const selectedGuardians = 0
        const batchRequestedGuardians = 2

        const { expectedLowBound, expectedHighBound } = expectedBounds({ selectedGuardians, batchRequestedGuardians, balances, totalRequestedGuardians })

        it('includes the first guardian', async () => {
          const { low, high } = await tree.getSearchBatchBounds(termId, selectedGuardians, batchRequestedGuardians, totalRequestedGuardians)

          assertBn(low, expectedLowBound, 'low bound does not match')
          assertBn(high, expectedHighBound, 'high bound does not match')
        })
      })

      context('when querying a middle batch', async () => {
        const selectedGuardians = 2
        const batchRequestedGuardians = 2

        const { expectedLowBound, expectedHighBound } = expectedBounds({ selectedGuardians, batchRequestedGuardians, balances, totalRequestedGuardians })

        it('includes middle guardians', async () => {
          const { low, high } = await tree.getSearchBatchBounds(termId, selectedGuardians, batchRequestedGuardians, totalRequestedGuardians)

          assertBn(low, expectedLowBound, 'low bound does not match')
          assertBn(high, expectedHighBound, 'high bound does not match')
        })
      })

      context('when querying a final batch', async () => {
        const selectedGuardians = 4
        const batchRequestedGuardians = 1

        const { expectedLowBound, expectedHighBound } = expectedBounds({ selectedGuardians, batchRequestedGuardians, balances, totalRequestedGuardians })

        it('includes the last guardian', async () => {
          const { low, high } = await tree.getSearchBatchBounds(termId, selectedGuardians, batchRequestedGuardians, totalRequestedGuardians)

          assertBn(low, expectedLowBound, 'low bound does not match')
          assertBn(high, expectedHighBound, 'high bound does not match')
        })
      })
    })
  })

  describe('computeSearchRandomBalances', () => {
    const termRandomness = '0x0000000000000000000000000000000000000000000000000000000000000000'
    const disputeId = 0
    const sortitionIteration = 0

    context('when the given bounds are zero', () => {
      const lowActiveBalanceBatchBound = bn(0)
      const highActiveBalanceBatchBound = bn(0)

      context('when the requested number of guardians is greater than zero', () => {
        const batchRequestedGuardians = 200

        it('reverts', async () => {
          await assertRevert(tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
        })
      })

      context('when the requested number of guardians is zero', () => {
        const batchRequestedGuardians = 0

        it('reverts', async () => {
          await assertRevert(tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
        })
      })
    })

    context('when the given bounds are not zero', () => {
      context('when the given bounds are equal', () => {
        const lowActiveBalanceBatchBound = bn(10)
        const highActiveBalanceBatchBound = bn(10)

        context('when the requested number of guardians is greater than zero', () => {
          const batchRequestedGuardians = 200

          it('reverts', async () => {
            await assertRevert(tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
          })
        })

        context('when the requested number of guardians is zero', () => {
          const batchRequestedGuardians = 0

          it('reverts', async () => {
            await assertRevert(tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
          })
        })
      })

      context('when the given bounds are not equal', () => {
        const lowActiveBalanceBatchBound = bn(0)
        const highActiveBalanceBatchBound = bn(10)

        context('when the requested number of guardians is greater than zero', () => {
          const batchRequestedGuardians = 200

          it('returns a ordered list of random balances', async () => {
            const balances = await tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound)

            assert.equal(balances.length, batchRequestedGuardians, 'list length does not match')

            for (let i = 0; i < batchRequestedGuardians - 1; i++) {
              assert.isAtLeast(balances[i + 1].toNumber(), balances[i].toNumber(), `item ${i} is not ordered`)
              assert.isAtMost(balances[i].toNumber(), highActiveBalanceBatchBound.toNumber(), `item ${i} is not included in the requested interval`)
            }

            const expectedSumTreeBalances = simulateComputeSearchRandomBalances({
              termRandomness,
              disputeId,
              sortitionIteration,
              batchRequestedGuardians,
              lowActiveBalanceBatchBound,
              highActiveBalanceBatchBound
            })

            for (let i = 0; i < batchRequestedGuardians; i++) {
              assertBn(balances[i], expectedSumTreeBalances[i], `balance ${i} doesn't match`)
            }
          })
        })

        context('when the requested number of guardians is zero', () => {
          const batchRequestedGuardians = 0

          it('returns an empty list', async () => {
            const balances = await tree.computeSearchRandomBalances(termRandomness, disputeId, sortitionIteration, batchRequestedGuardians, lowActiveBalanceBatchBound, highActiveBalanceBatchBound)

            assert.equal(balances.length, 0, 'list length does not match')
          })
        })
      })
    })
  })

  describe('batchedRandomSearch', () => {
    const termId = 0
    const disputeId = 0
    const sortitionIteration = 0
    const roundRequestedGuardians = 10
    const termRandomness = '0x0000000000000000000000000000000000000000000000000000000000000000'

    context('when there are no balances in the tree', () => {
      const selectedGuardians = 0
      const batchRequestedGuardians = 5

      it('reverts', async () => {
        await assertRevert(tree.batchedRandomSearch(termRandomness, disputeId, termId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians, sortitionIteration), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
      })
    })

    context('when there are some balances in the tree', () => {
      const balances = Array.from(Array(100).keys()).map(x => bn(x))

      beforeEach('insert values', async () => {
        for (let i = 0; i < 100; i++) await tree.insert(termId, balances[i])
      })

      context('when the requested number of guardians is zero', () => {
        const selectedGuardians = 0
        const batchRequestedGuardians = 0

        it('reverts', async () => {
          await assertRevert(tree.batchedRandomSearch(termRandomness, disputeId, termId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians, sortitionIteration), TREE_ERRORS.INVALID_INTERVAL_SEARCH)
        })
      })

      context('when the requested number of guardians is greater than zero', () => {
        context('for a first batch', () => {
          const selectedGuardians = 0
          const batchRequestedGuardians = 5

          it('returns the expected results', async () => {
            const { guardiansIds, activeBalances } = await tree.batchedRandomSearch(termRandomness, disputeId, termId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians, sortitionIteration)

            assert.equal(guardiansIds.length, batchRequestedGuardians, 'result keys length does not match')
            assert.equal(activeBalances.length, batchRequestedGuardians, 'result values length does not match')

            const expectedGuardianIds = simulateBatchedRandomSearch({
              termRandomness,
              disputeId,
              selectedGuardians,
              batchRequestedGuardians,
              roundRequestedGuardians,
              sortitionIteration,
              balances,
              getTreeKey
            })

            for (let i = 0; i < batchRequestedGuardians; i++) {
              assertBn(guardiansIds[i], expectedGuardianIds[i], `result key ${i} does not match`)
              assertBn(activeBalances[i], expectedGuardianIds[i], `result value ${i} does not match`)
            }
          })
        })

        context('for a second batch', () => {
          const selectedGuardians = 5
          const batchRequestedGuardians = 5

          it('returns the expected results', async () => {
            const { guardiansIds, activeBalances } = await tree.batchedRandomSearch(termRandomness, disputeId, termId, selectedGuardians, batchRequestedGuardians, roundRequestedGuardians, sortitionIteration)

            assert.equal(guardiansIds.length, batchRequestedGuardians, 'result keys length does not match')
            assert.equal(activeBalances.length, batchRequestedGuardians, 'result values length does not match')

            const expectedGuardianIds = simulateBatchedRandomSearch({
              termRandomness,
              disputeId,
              selectedGuardians,
              batchRequestedGuardians,
              roundRequestedGuardians,
              sortitionIteration,
              balances,
              getTreeKey
            })

            for (let i = 0; i < batchRequestedGuardians; i++) {
              assertBn(guardiansIds[i], expectedGuardianIds[i], `result key ${i} does not match`)
              assertBn(activeBalances[i], expectedGuardianIds[i], `result value ${i} does not match`)
            }
          })
        })
      })
    })
  })
})
