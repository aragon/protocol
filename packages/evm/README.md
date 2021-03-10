# Aragon Court EVM

This package includes the Aragon Court's smart contracts developed for the Ethereum Virtual Machine.

## How does it work

**Full description of the mechanism: [Mechanism documentation](/docs/1-mechanism)**

Aragon Court handles subjective disputes that cannot be solved by smart contracts. For this, it employs guardians that need to stake a token to the Court which allows them to get drafted to adjudicate disputes, that can earn them fees. The more tokens a guardian has activated, the higher the chance to get drafted and earn more fees.

Aragon Court attempts to find what the subjective truth is with a [Schelling game](https://en.wikipedia.org/wiki/Focal_point_(game_theory)). guardians are asked to vote on the ruling that they think their fellow guardians are more likely to vote on. To incentivize consensus, guardians that don't vote on the consensus ruling have some tokens slashed. guardians that vote with the consensus ruling are rewarded with ruling fees and guardian tokens from the guardians that voted for a minority ruling.

A design goal of the mechanism is to require very few guardians to adjudicate a dispute and produce a ruling. A small number of guardians is adjudicated by default to a dispute, and their ruling can be appealed in multiple rounds of appeals.

Even though Aragon Court could theoretically resolve any type of binary dispute, in its first deployments it will be used to arbitrate **agreements.** These agreements require entities creating a proposal in an organization to agree to its specific rules around proposal creation, putting some collateral at stake that could be lost if the Court finds the proposal invalid.

## Installation

Simply clone this monorepo and install dependencies:

```bash
git clone git@github.com:aragon/protocol.git
cd protocol 
yarn
```

As a sanity check you can run the tests to make sure everything work as expected:

```bash
yarn test
```
