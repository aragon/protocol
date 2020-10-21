const { bigExp } = require('@aragon/contract-helpers-test')

const ONE_WEEK = 60 * 60 * 24 * 7

module.exports = {
  ganache: {
    tokens: [],                                                       // No tokens set for local env
  },
  staging: {
    owner:        undefined,                                          // Ownership will remain to the sender
    tokens: [
      {
        symbol:   'ANT',
        address:  '0x5CbDc338f71888A93323C922cAaba84402dB1193',       // ANT address in Staging
        period:   ONE_WEEK,                                           // The ANT quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 ANT per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 ANT
      },
      {
        symbol:   'DAI',
        address:  '0x8F2Ac3fD1a9Ce7208eFff7C31aC0e2A98b0778f3',       // Fee token (DAI) address in Staging
        period:   ONE_WEEK,                                           // The fee token quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 DAI per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 DAI
      }
    ]
  },
  ropsten: {
    owner:        undefined,                                          // Ownership will remain to the sender
    tokens: [
      {
        symbol:   'ANT',
        address:  '0x45B4704F873E39670450Ac5A2C5f9Dad6BEa5679',       // ANT address in Ropsten
        period:   ONE_WEEK,                                           // The ANT quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 ANT per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 ANT
      },
      {
        symbol:   'DAI',
        address:  '0x0c0Ad38e0b58C20Dd713633Ff9Ca19e0654B0f9e',       // Fee token (DAI) address in Ropsten
        period:   ONE_WEEK,                                           // The fee token quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 DAI per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 DAI
      }
    ]
  },
  rinkeby: {
    owner:        undefined,                                          // Ownership will remain to the sender
    tokens: [
      {
        symbol:   'ANT',
        address:  '0xd0389B41c33BDFBed6BbB8e083A27F880B99B0CC',       // ANT address in Rinkeby
        period:   ONE_WEEK,                                           // The ANT quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 ANT per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 ANT
      },
      {
        symbol:   'DAI',
        address:  '0xb08E32D658700f768f5bADf0679E153ffFEC42e6',       // Fee token (DAI) address in Rinkeby
        period:   ONE_WEEK,                                           // The fee token quota period lasts 1 week
        amount:   bigExp(10000, 18),                                  // Accounts will be allowed to withdraw 10,000 DAI per week maximum
        donation: bigExp(1000000, 18)                                 // Donate an initial amount of 1,000,000 DAI
      }
    ]
  },
}
