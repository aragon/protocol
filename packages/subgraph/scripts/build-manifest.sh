#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Validate network
networks=(ganache rinkeby staging mainnet) # ropsten will be supported in the near future.
if [[ -z $NETWORK || ! " ${networks[@]} " =~ " ${NETWORK} " ]]; then
  echo 'Please make sure the network provided is either ganache, ropsten, staging, rinkeby, or mainnet.'
  exit 1
fi

# Court known addresses
court_rinkeby=0xC464EB732A1D2f5BbD705727576065C91B2E9f18
court_staging=0x9c003eC97676c30a041f128D671b3Db2f790c3E7
court_mainnet=0xFb072baA713B01cE944A0515c3e1e98170977dAF

# Known block numbers
start_block_rinkeby=7519991
start_block_staging=7519991
start_block_mainnet=12605540

# Lately, only rinkeby/mainnet deployments are supported. court_ropsten and court_staging
# are commented until the aragon decides to fully support those networks too.
# court_ropsten=0xc236205f7f1c4a4B0A857c350BF64bB0FF385702
# start_block_ropsten=9038827

# Use mainnet network in case of local deployment
if [[ "$NETWORK" = "ganache" ]]; then
  ENV='mainnet'
elif [[ "$NETWORK" = "staging" ]]; then
  ENV='rinkeby'
else
  ENV=${NETWORK}
fi

# Load start block
if [[ -z $START_BLOCK ]]; then
  START_BLOCK_VAR=start_block_$NETWORK
  START_BLOCK=${!START_BLOCK_VAR}
fi
if [[ -z $START_BLOCK ]]; then
  START_BLOCK=0
fi

# Try loading Court address if missing
if [[ -z $COURT ]]; then
  COURT_VAR=court_$NETWORK
  COURT=${!COURT_VAR}
fi

# Validate court address
if [[ -z $COURT ]]; then
  echo 'Please make sure a Court address is provided'
  exit 1
fi

# Remove previous subgraph if there is any
if [ -f subgraph.yaml ]; then
  echo 'Removing previous subgraph manifest...'
  rm subgraph.yaml
fi

# Build subgraph manifest for requested variables
echo "Preparing new subgraph for Court address ${COURT} to network ${NETWORK}"
cp subgraph.template.yaml subgraph.yaml
sed -i -e "s/{{network}}/${ENV}/g" subgraph.yaml
sed -i -e "s/{{court}}/${COURT}/g" subgraph.yaml
sed -i -e "s/{{startBlock}}/${START_BLOCK}/g" subgraph.yaml
rm -f subgraph.yaml-e

# Parse blacklisted modules
echo "Setting blacklisted modules"
node ./scripts/parse-blacklisted-modules.js "$NETWORK"
