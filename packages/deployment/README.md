# Aragon Protocol deployment scripts

This package includes the deployment scripts used for Aragon Protocol 

## Installation

Clone this monorepo and install dependencies:

```sh
git clone git@github.com:aragon/protocol.git 
yarn
```

## Commands

To see all the available commands run `yarn run help`. However, the ones you will be interested in are:

```
deploy-protocol	    Deploy Aragon Protocol
deploy-faucet  	    Deploy token faucet
```

To execute any of those commands simply run: `yarn [COMMAND] --network [NETWORK]`. See the following example:

## Deployment

All the deployment scripts are built on top of Buidler. Therefore, make sure you have a local networks config file.
If you don't, simply follow the steps explained [here](https://buidler.dev/plugins/buidler-local-networks-config-plugin.html). 

If you're working on a local environment make sure you have one running or start one running `yarn run node`.  

Once you have done that, you can deploy an Aragon Protocol instance by running:

```
yarn deploy-protocol --network localhost
```

If you are working on a different network simply change `localhost` by any of `rinkeby`, `ropsten`, `staging`, or `mainnet`.
