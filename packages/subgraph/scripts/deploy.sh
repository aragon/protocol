#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Run graph build
npm run build:graph

# Require $GRAPHKEY to be set
if [[ -z "${GRAPHKEY}" ]]; then
  echo "Please set \$GRAPHKEY to your The Graph access token to run this command."
  exit 1
fi

# Select IPFS and The Graph nodes
if [[ "$NETWORK" = "ganache" ]]; then
  IPFS_NODE="http://localhost:5001"
  GRAPH_NODE="http://127.0.0.1:8020"
else
  IPFS_NODE="https://api.thegraph.com/ipfs/"
  GRAPH_NODE="https://api.thegraph.com/deploy/"
fi

# Create subgraph if missing
{
  graph create aragon/aragon-protocol-${NETWORK} --node ${GRAPH_NODE}
} || {
  echo 'Subgraph was already created'
}

# Deploy subgraph
graph deploy aragon/aragon-protocol-${NETWORK} \
  --ipfs ${IPFS_NODE} \
  --node ${GRAPH_NODE} \
  --access-token "$GRAPHKEY" > deploy-output.txt

SUBGRAPH_ID=$(grep "Build completed:" deploy-output.txt | grep -oE "Qm[a-zA-Z0-9]{44}")
rm deploy-output.txt
echo "The Graph deployment complete: ${SUBGRAPH_ID}"

if [[ -z "$SUBGRAPH_ID" ]]; then
  echo "Could not find subgraph ID in deploy output, cannot deploy to Aragon infra."
else
  echo "Deploying subgraph ${SUBGRAPH_ID} to Aragon infra..."
  kubectl exec graph-shell -- create aragon/aragon-protocol-${NETWORK}
  kubectl exec graph-shell -- deploy aragon/aragon-protocol-${NETWORK} ${SUBGRAPH_ID} graph_index_node_0
  kubectl exec graph-shell -- reassign aragon/aragon-protocol-${NETWORK} ${SUBGRAPH_ID} graph_index_node_0
fi
