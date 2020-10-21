const { printTable } = require('../test/helpers/utils/logging')
const { bn, bigExp, getEventArgument } = require('@aragon/contract-helpers-test')

const MAX_APPEAL_ROUNDS = 4
const APPEAL_STEP_FACTOR = 3
const INITIAL_GUARDIANS_NUMBER = 3

const TREE_SIZE_STEP_FACTOR = 10
const TREE_MAX_SIZE = 10000

const MIN_GUARDIAN_BALANCE = 100
const MAX_GUARDIAN_BALANCE = 1000000

async function profileGas() {
  console.log(`MAX_APPEAL_ROUNDS: ${MAX_APPEAL_ROUNDS}`)
  console.log(`APPEAL_STEP_FACTOR: ${APPEAL_STEP_FACTOR}`)
  console.log(`INITIAL_GUARDIANS_NUMBER: ${INITIAL_GUARDIANS_NUMBER}`)
  const HexSumTree = artifacts.require('HexSumTreeGasProfiler')

  for (let treeSize = TREE_SIZE_STEP_FACTOR; treeSize <= TREE_MAX_SIZE; treeSize *= TREE_SIZE_STEP_FACTOR) {
    console.log(`\n=====================================`)
    console.log(`PROFILING TREE WITH SIZE ${treeSize}`)
    const tree = await HexSumTree.new()
    await insert(tree, treeSize)

    for (let round = 1, guardiansNumber = INITIAL_GUARDIANS_NUMBER; round <= MAX_APPEAL_ROUNDS; round++, guardiansNumber *= APPEAL_STEP_FACTOR) {
      console.log(`\n------------------------------------`)
      console.log(`ROUND #${round} - drafting ${guardiansNumber} guardians`)
      await search(tree, guardiansNumber, round)
    }
  }
}

async function insert(tree, values) {
  const insertGasCosts = []
  for (let i = 0; i < values; i++) {
    const balance = Math.floor(Math.random() * MAX_GUARDIAN_BALANCE) + MIN_GUARDIAN_BALANCE
    const receipt = await tree.insert(0, bigExp(balance, 18))
    insertGasCosts.push(getGas(receipt))
  }

  await logTreeState(tree)
  logInsertStats(`${values} values inserted:`, insertGasCosts)
}

async function search(tree, guardiansNumber, batches) {
  const searchGasCosts = []
  const values = await computeSearchValues(tree, guardiansNumber, batches)
  for (let batch = 0; batch < batches; batch++) {
    const batchSearchValues = values[batch]
    const receipt = await tree.search(batchSearchValues, 0)
    searchGasCosts.push({ ...getGas(receipt), values: batchSearchValues.length })
  }

  logSearchStats(`${guardiansNumber} guardians searched in ${batches} batches:`, searchGasCosts)
}

async function computeSearchValues(tree, guardiansNumber, batches) {
  const searchValues = []
  const total = (await tree.total()).div(bigExp(1, 18))
  const step = total.div(bn(guardiansNumber)).sub(bn(1))
  for (let i = 1; i <= guardiansNumber; i++) {
    const value = step.mul(bn(i))
    searchValues.push(bigExp(value, 18))
  }

  const searchValuesPerBatch = []
  const guardiansPerBatch = Math.floor(guardiansNumber / batches)
  for (let batch = 0, batchSize = 0; batch < batches; batch++, batchSize += guardiansPerBatch) {
    const limit = (batch === batches - 1) ? searchValues.length : batchSize + guardiansPerBatch
    searchValuesPerBatch.push(searchValues.slice(batchSize, limit))
  }
  return searchValuesPerBatch
}

const getGas = receipt => {
  const total = receipt.receipt.gasUsed
  const functionCost = getEventArgument(receipt, 'GasConsumed', 'gas').toNumber()
  return { total, function: functionCost }
}

const logTreeState = async (tree) => {
  const total = await tree.total()
  const height = await tree.height()
  const nextKey = await tree.nextKey()
  console.log(`\nTree height:   ${height.toString()}`)
  console.log(`Tree next key: ${nextKey.toNumber().toLocaleString()}`)
  console.log(`Tree total:    ${total.div(bigExp(1, 18)).toNumber().toLocaleString()} e18`)
}

const logInsertStats = (title, gasCosts) => {
  const min = prop => Math.min(...gasCosts.map(x => x[prop])).toLocaleString()
  const max = prop => Math.max(...gasCosts.map(x => x[prop])).toLocaleString()
  const avg = prop => Math.round(gasCosts.map(x => x[prop]).reduce((a, b) => a + b, 0) / gasCosts.length).toLocaleString()

  printTable(title, [
    ['', 'Total', 'Function'],
    ['Min', min('total'), min('function')],
    ['Max', max('total'), max('function')],
    ['Average', avg('total'), avg('function')]
  ])
}

const logSearchStats = (title, gasCosts) => {
  const body = gasCosts.map((gasCost, batch) => {
    const { total, values, function: fnCost } = gasCost
    const batchName = `Batch ${batch} - ${values} values`
    return [batchName, total.toLocaleString(), fnCost.toLocaleString()]
  })

  printTable(title, [['', 'Total', 'Function'], ...body])
}

module.exports = callback => {
  profileGas()
    .then(callback)
    .catch(callback)
}
