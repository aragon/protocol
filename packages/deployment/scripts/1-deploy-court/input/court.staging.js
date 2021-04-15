const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { staging: governor } = require('./governor')

const TERM_DURATION = 60 * 10                                          // 10 minutes
const START_DATE = Math.floor(new Date() / 1000 + TERM_DURATION + 120) // 2 minutes from now

const ANT = {
  symbol: 'ANT',
  decimals: 18,
  address: '0x5CbDc338f71888A93323C922cAaba84402dB1193' // fake Staging ANT
}

const DAI = {
  symbol: 'DAI',
  decimals: 18,
  address: '0x8F2Ac3fD1a9Ce7208eFff7C31aC0e2A98b0778f3' // fake Staging DAI
}

module.exports = {
  governor:                       governor,
  token:                          ANT,                  // court token is ANT
  minActiveBalance:               bigExp(100, 18),      // 100 ANT is the minimum balance guardians must activate to participate in the Court
  feeToken:                       DAI,                  // fee token for the court is DAI
  termDuration:                   bn(TERM_DURATION),    // terms lasts 8 hours
  firstTermStartTime:             bn(START_DATE),       // first term start timestamp in seconds
  evidenceTerms:                  bn(2),                // evidence period lasts 2 terms (20 minutes)
  commitTerms:                    bn(2),                // vote commits last 2 terms (20 minutes)
  revealTerms:                    bn(2),                // vote reveals last 2 terms (20 minutes)
  appealTerms:                    bn(2),                // appeals last 2 terms (20 minutes)
  appealConfirmTerms:             bn(2),                // appeal confirmations last 2 terms (20 minutes)
  maxGuardiansPerDraftBatch:      bn(81),               // max number of guardians drafted per batch
  guardianFee:                    bigExp(40, 18),       // 40 fee tokens for guardian fees
  draftFee:                       bigExp(6, 18),        // 6 fee tokens for draft fees
  settleFee:                      bigExp(4, 18),        // 4 fee tokens for settle fees
  penaltyPct:                     bn(3000),             // 30% of the min active balance will be locked to each drafted guardian
  finalRoundReduction:            bn(5000),             // 50% of discount for final rounds
  firstRoundGuardiansNumber:      bn(3),                // disputes will start with 3 guardians
  appealStepFactor:               bn(3),                // the number of guardians to be drafted will be incremented 3 times on each appeal
  maxRegularAppealRounds:         bn(4),                // there can be up to 4 appeals in total per dispute
  finalRoundLockTerms:            bn(21),               // coherent guardians in the final round won't be able to withdraw for 21 terms (7 days)
  appealCollateralFactor:         bn(30000),            // appeal collateral is 3x of the corresponding guardian fees
  appealConfirmCollateralFactor:  bn(20000),            // appeal-confirmation collateral is 2x of the corresponding guardian fees
  finalRoundWeightPrecision:      bn(1000),             // use to improve division rounding for final round maths
  skippedDisputes:                bn(0),                // number of dispute to skip
  paymentPeriodDuration:          bn(6),                // each payment period lasts 6 terms (1 hour)
  paymentsGovernorSharePct:       bn(0)                 // none payments governor share
}
