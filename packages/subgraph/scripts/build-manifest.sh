#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Protocol known addresses
protocol_ropsten=0xc236205f7f1c4a4B0A857c350BF64bB0FF385702
protocol_staging=0x3E5D4a431f955C1eaB2BF919e174426572c4714F
protocol_rinkeby=0x3F5E248BB5cd3c1275304e692d6cacC708E004d0
protocol_mainnet=

# Known block numbers
start_block_ropsten=9038827
start_block_staging=7519974
start_block_rinkeby=7519991
start_block_mainnet=

# Validate network
networks=(ganache ropsten staging rinkeby mainnet)
if [[ -z $NETWORK || ! " ${networks[@]} " =~ " ${NETWORK} " ]]; then
  echo 'Please make sure the network provided is either ganache, ropsten, staging, rinkeby, or mainnet.'
  exit 1
fi

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

# Try loading Protocol address if missing
if [[ -z $PROTOCOL ]]; then
  PROTOCOL_VAR=protocol_$NETWORK
  PROTOCOL=${!PROTOCOL_VAR}
fi

# Validate protocol address
if [[ -z $PROTOCOL ]]; then
  echo 'Please make sure a Protocol address is provided'
  exit 1
fi

# Remove previous subgraph if there is any
if [ -f subgraph.yaml ]; then
  echo 'Removing previous subgraph manifest...'
  rm subgraph.yaml
fi

# Build subgraph manifest for requested variables
echo "Preparing new subgraph for Protocol address ${PROTOCOL} to network ${NETWORK}"
cp subgraph.template.yaml subgraph.yaml
sed -i -e "s/{{network}}/${ENV}/g" subgraph.yaml
sed -i -e "s/{{protocol}}/${PROTOCOL}/g" subgraph.yaml
sed -i -e "s/{{startBlock}}/${START_BLOCK}/g" subgraph.yaml
rm -f subgraph.yaml-e

# Parse blacklisted modules
echo "Setting blacklisted modules"
node ./scripts/parse-blacklisted-modules.js "$NETWORK"
