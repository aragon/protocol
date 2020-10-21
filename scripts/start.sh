#!/usr/bin/env bash

# Exit script as soon as a command fails
set -o errexit

# Executes cleanup function at script exit
trap cleanup EXIT

cleanup() {
  # Kill local node if it's still running
  if [ -n "$rpc_pid" ] && ps -p $rpc_pid > /dev/null; then
    kill -9 $rpc_pid
  fi
}

start_local_node() {
  echo "Starting local ganache..."
  yarn workspace @aragon/protocol-deployment ganache > /dev/null &
  rpc_pid=$!
  sleep 3
  echo "Running local ganache with pid ${rpc_pid}"
}

deploy_protocol() {
  if [ -f ./packages/deployment/scripts/1-deploy-protocol/output/protocol.ganache.json ]; then
    echo "Removing previous deployment file..."
    rm ./packages/deployment/scripts/1-deploy-protocol/output/protocol.ganache.json
  fi

  echo "Deploying Aragon Protocol to local node..."
  yarn workspace @aragon/protocol-deployment deploy-protocol --network ganache
}

start_local_node
deploy_protocol

while true; do
  read
done
