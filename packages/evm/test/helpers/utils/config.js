const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertBn } = require('@aragon/contract-helpers-test/src/asserts')
const { getArtifacts } = require('@aragon/contract-helpers-test/src/config')

const PCT_BASE = bn(10000)

async function buildNewConfig(config, iteration = 1) {
  const artifacts = getArtifacts()
  return {
    feeToken: await artifacts.require('ERC20Mock').new('Court Fee Token', 'CFT', 18),
    guardianFee: config.guardianFee.add(bigExp(iteration * 10, 18)),
    draftFee: config.draftFee.add(bigExp(iteration * 10, 18)),
    settleFee: config.settleFee.add(bigExp(iteration * 10, 18)),
    evidenceTerms: config.evidenceTerms.add(bn(iteration)),
    commitTerms: config.commitTerms.add(bn(iteration)),
    revealTerms: config.revealTerms.add(bn(iteration)),
    appealTerms: config.appealTerms.add(bn(iteration)),
    appealConfirmTerms: config.appealConfirmTerms.add(bn(iteration)),
    penaltyPct: config.penaltyPct.add(bn(iteration * 100)),
    finalRoundReduction: config.finalRoundReduction.add(bn(iteration * 100)),
    firstRoundGuardiansNumber: config.firstRoundGuardiansNumber.add(bn(iteration)),
    appealStepFactor: config.appealStepFactor.add(bn(iteration)),
    maxRegularAppealRounds: config.maxRegularAppealRounds.add(bn(iteration)),
    finalRoundLockTerms: config.finalRoundLockTerms.add(bn(1)),
    appealCollateralFactor: config.appealCollateralFactor.add(bn(iteration * PCT_BASE)),
    appealConfirmCollateralFactor: config.appealConfirmCollateralFactor.add(bn(iteration * PCT_BASE)),
    minActiveBalance: config.minActiveBalance.add(bigExp(iteration * 100, 18))
  }
}

async function assertConfig(actualConfig, expectedConfig) {
  assert.equal(actualConfig.feeToken.address, expectedConfig.feeToken.address, 'fee token does not match')
  assertBn(actualConfig.guardianFee, expectedConfig.guardianFee, 'guardian fee does not match')
  assertBn(actualConfig.draftFee, expectedConfig.draftFee, 'draft fee does not match')
  assertBn(actualConfig.settleFee, expectedConfig.settleFee, 'settle fee does not match')
  assertBn(actualConfig.commitTerms, expectedConfig.commitTerms, 'commit terms number does not match')
  assertBn(actualConfig.revealTerms, expectedConfig.revealTerms, 'reveal terms number does not match')
  assertBn(actualConfig.appealTerms, expectedConfig.appealTerms, 'appeal terms number does not match')
  assertBn(actualConfig.appealConfirmTerms, expectedConfig.appealConfirmTerms, 'appeal confirmation terms number does not match')
  assertBn(actualConfig.penaltyPct, expectedConfig.penaltyPct, 'penalty permyriad does not match')
  assertBn(actualConfig.finalRoundReduction, expectedConfig.finalRoundReduction, 'final round reduction does not match')
  assertBn(actualConfig.firstRoundGuardiansNumber, expectedConfig.firstRoundGuardiansNumber, 'first round guardians number does not match')
  assertBn(actualConfig.appealStepFactor, expectedConfig.appealStepFactor, 'appeal step factor does not match')
  assertBn(actualConfig.maxRegularAppealRounds, expectedConfig.maxRegularAppealRounds, 'number of max regular appeal rounds does not match')
  assertBn(actualConfig.finalRoundLockTerms, expectedConfig.finalRoundLockTerms, 'number of final round lock terms does not match')
  assertBn(actualConfig.appealCollateralFactor, expectedConfig.appealCollateralFactor, 'appeal collateral factor does not match')
  assertBn(actualConfig.appealConfirmCollateralFactor, expectedConfig.appealConfirmCollateralFactor, 'appeal confirmation collateral factor does not match')
  assertBn(actualConfig.minActiveBalance, expectedConfig.minActiveBalance, 'min active balance does not match')
}

module.exports = {
  buildNewConfig,
  assertConfig
}
