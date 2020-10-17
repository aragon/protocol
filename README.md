![Aragon Protocol](./docs/aragon-protocol.png)

<img align="right" src="https://github.com/aragon/protocol/workflows/CI/badge.svg">
  <a href="https://github.com/aragon/protocol/actions"/>
</img>

## Project

#### 👩‍️ [Become an Aragon Protocol guardian](https://ant.aragon.org)
Aragon Protocol is now live on Ethereum mainnet. You can become a guardian by staking ANT.

#### ⚖ [Check out the Aragon Protocol Dashboard](https://protocol.aragon.org)
The Aragon Protocol Dashboard is the central app where all dispute-related information is available for guardians.

#### 📚 [Read the User Guide](https://help.aragon.org/category/47-aragoncourt) 
Read the user guide if you have any doubts about the Aragon protocol, Protocol Dashboard, or related tools.

## Protocol

#### 📓 [Read the full documentation](/docs)
Aragon Protocol is a dispute resolution protocol that runs on Ethereum. It's one of the core components of the [Aragon Network](https://aragon.org/network/).

#### 🚧 Project stage: v1 implementation
After a long research and development phase, Aragon Protocol's v1 implementation has been [released](https://www.npmjs.com/package/@aragon/protocol) and [deployed](https://etherscan.io/address/0xee4650cBe7a2B23701D416f58b41D8B76b617797#code).

#### ✅ Security review status: audited
Aragon Protocol v1 has already been audited by an independent security professional. You can read the audit report [here](https://github.com/gakonst/publications/blob/master/aragon_protocol_audit.pdf). 

#### 👋 Get started contributing with a [good first issue](https://github.com/aragon/aragon-protocol/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
Don't be shy to contribute even the smallest tweak. Everyone will be especially nice and helpful to beginners to help you get started!

## How does it work

**Full description of the mechanism: [Mechanism documentation](/docs/1-mechanism)**

Aragon Protocol handles subjective disputes that cannot be solved by smart contracts. For this, it employs guardians that need to stake a token to the Protocol which allows them to get drafted to adjudicate disputes, that can earn them fees. The more tokens a guardian has activated, the higher the chance to get drafted and earn more fees.

Aragon Protocol attempts to find what the subjective truth is with a [Schelling game](https://en.wikipedia.org/wiki/Focal_point_(game_theory)). guardians are asked to vote on the ruling that they think their fellow guardians are more likely to vote on. To incentivize consensus, guardians that don't vote on the consensus ruling have some tokens slashed. guardians that vote with the consensus ruling are rewarded with ruling fees and guardian tokens from the guardians that voted for a minority ruling.

A design goal of the mechanism is to require very few guardians to adjudicate a dispute and produce a ruling. A small number of guardians is adjudicated by default to a dispute, and their ruling can be appealed in multiple rounds of appeals.

Even though Aragon Protocol could theoretically resolve any type of binary dispute, in its first deployments it will be used to arbitrate **agreements.** These agreements require entities creating a proposal in an organization to agree to its specific rules around proposal creation, putting some collateral at stake that could be lost if the Protocol finds the proposal invalid.

## Deployed instances

#### Mainnet

The mainnet instance of Aragon Protocol is deployed at [`0xee4650cBe7a2B23701D416f58b41D8B76b617797`](https://etherscan.io/address/0xee4650cBe7a2B23701D416f58b41D8B76b617797#code)

#### Testing

There are a few testing instances deployed of Aragon Protocol, please refer to the [testing guide](/docs/8-testing-guide) to have a better understanding on using these.

## Help shape Aragon Protocol
- Discuss in [Aragon Forum](https://forum.aragon.org/tags/dispute-resolution)
- Join the [Aragon Protocol channel](https://discord.gg/nxMejdG) on Discord.
