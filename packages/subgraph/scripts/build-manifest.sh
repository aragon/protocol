#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Validate network
networks=(ganache rinkeby mainnet) # ropsten will be supported in the near future.
if [[ -z $NETWORK || ! " ${networks[@]} " =~ " ${NETWORK} " ]]; then
  echo 'Please make sure the network provided is either ganache, ropsten, staging, rinkeby, or mainnet.'
  exit 1
fi


# Court known addresses
court_rinkeby=0xA88c52E80f15440B223a24c1e8f22f21D18D8d5f
court_mainnet=

# Known block numbers
start_block_rinkeby=7519991
start_block_mainnet=

# Lately, only rinkeby/mainnet deployments are supported. court_ropsten and court_staging
# are commented until the aragon decides to fully support those networks too.
# court_ropsten=0xc236205f7f1c4a4B0A857c350BF64bB0FF385702
# court_staging=0x3E5D4a431f955C1eaB2BF919e174426572c4714F
# start_block_ropsten=9038827
# start_block_staging=7519974

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
