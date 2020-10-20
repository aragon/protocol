const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { mainnet: governor } = require('./governor')

const TERM_DURATION = 60 * 60 * 8                                           // 8 hours
const START_DATE = Math.floor(new Date('2020-11-05T16:00:00.000Z') / 1000)  // 2020, Nov 5th 16.00 UTC

const ANT = {
  symbol: 'ANT',
  decimals: 18,
  address: '0x960b236a07cf122663c4303350609a66a7b288c0' // ANT v1 # TODO: update to v2
}

const DAI = {
  symbol: 'DAI',
  decimals: 18,
  address: '0x6b175474e89094c44da98b954eedeac495271d0f' // MC DAI (v2)
}

module.exports = {
  governor:                       governor,
  token:                          ANT,                  // protocol token is ANT
  minActiveBalance:               bigExp(100, 18),      // 100 ANT is the minimum balance guardians must activate to participate in the Protocol
  feeToken:                       DAI,                  // fee token for the protocol is DAI
  termDuration:                   bn(TERM_DURATION),    // terms lasts 8 hours
  firstTermStartTime:             bn(START_DATE),       // first term start timestamp in seconds
  evidenceTerms:                  bn(21),               // evidence period lasts 21 terms (7 days)
  commitTerms:                    bn(6),                // vote commits last 6 terms (2 days)
  revealTerms:                    bn(6),                // vote reveals last 6 terms (2 days)
  appealTerms:                    bn(6),                // appeals last 6 terms (2 days)
  appealConfirmTerms:             bn(6),                // appeal confirmations last 6 terms (2 days)
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
  paymentPeriodDuration:          bn(90),               // each payment period lasts 90 terms (30 days)
  paymentsGovernorSharePct:       bn(0)                 // none payments governor share
}
