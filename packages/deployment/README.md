# Aragon Court deployment scripts

This package includes the deployment scripts used for Aragon Court

## Installation

Clone this monorepo and install dependencies:

```bash
git clone git@github.com:aragon/protocol.git
cd protocol/packages/deployment
yarn
```

## Commands

To see all the available commands run `yarn run help`. However, the ones you will be interested in are:

```
deploy-court   	    Deploy Aragon Court
deploy-faucet  	    Deploy token faucet
```

To execute any of those commands simply run: `yarn [COMMAND] --network [NETWORK]`. See the following example:

## Deployment

All the deployment scripts are built on top of Buidler. Therefore, make sure you have a local networks config file.
If you don't, simply follow the steps explained [here](https://www.npmjs.com/package/buidler-local-networks-config-plugin).

If you're working on a local environment make sure you have one running or start one running `yarn ganache`.  

Once you have done that, you can deploy an Aragon Court instance by running:

```
yarn deploy-court --network ganache
```

If you are working on a different network simply change `ganache` by any of `rinkeby`, `ropsten`, `staging`, or `mainnet`.
