import { ethereum, Address, BigInt } from '@graphprotocol/graph-ts'

import { buildId } from '../helpers/utils'
import { loadOrCreateERC20 } from './ERC20'

import { Protocol, Guardian, StakingMovement, GuardiansRegistryModule } from '../types/schema'
import {
  Staked,
  Unstaked,
  GuardianActivated,
  GuardianDeactivationProcessed,
  GuardianDeactivationRequested,
  GuardianDeactivationUpdated,
  GuardianBalanceLocked,
  GuardianBalanceUnlocked,
  GuardianTokensAssigned,
  GuardianTokensCollected,
  GuardianSlashed,
  GuardiansRegistry
} from '../types/templates/GuardiansRegistry/GuardiansRegistry'

const STAKE = 'Stake'
const UNSTAKE = 'Unstake'
const ACTIVATION = 'Activation'
const DEACTIVATION = 'Deactivation'
const LOCK = 'Lock'
const UNLOCK = 'Unlock'
const REWARD = 'Reward'
const SLASH = 'Slash'

export function handleStaked(event: Staked): void {
  updateGuardian(event.params.user, event)
  createStakingMovementForEvent(event.params.user, STAKE, event.params.amount, event)
  increaseTotalStaked(event.address, event.params.amount)
}

export function handleUnstaked(event: Unstaked): void {
  updateGuardian(event.params.user, event)
  createStakingMovementForEvent(event.params.user, UNSTAKE, event.params.amount, event)
  decreaseTotalStaked(event.address, event.params.amount)
}

export function handleGuardianActivated(event: GuardianActivated): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForTerm(event.params.guardian, ACTIVATION, event.params.amount, event.params.fromTermId, event)
  increaseTotalActive(event.address, event.params.amount)
}

export function handleGuardianDeactivationRequested(event: GuardianDeactivationRequested): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForTerm(event.params.guardian, DEACTIVATION, event.params.amount, event.params.availableTermId, event)
  increaseTotalDeactivation(event.address, event.params.amount)
}

export function handleGuardianDeactivationUpdated(event: GuardianDeactivationUpdated): void {
  const guardian = loadOrCreateGuardian(event.params.guardian, event)
  const previousDeactivationAmount = guardian.deactivationBalance

  updateGuardian(event.params.guardian, event)
  createStakingMovementForTerm(event.params.guardian, DEACTIVATION, event.params.amount, event.params.availableTermId, event)

  const currentDeactivationAmount = event.params.amount
  if (currentDeactivationAmount.gt(previousDeactivationAmount)) {
    increaseTotalDeactivation(event.address, currentDeactivationAmount.minus(previousDeactivationAmount))
  } else {
    decreaseTotalDeactivation(event.address, previousDeactivationAmount.minus(currentDeactivationAmount))
  }
}

export function handleGuardianDeactivationProcessed(event: GuardianDeactivationProcessed): void {
  updateGuardian(event.params.guardian, event)
  decreaseTotalActive(event.address, event.params.amount)
  decreaseTotalDeactivation(event.address, event.params.amount)
}

export function handleGuardianBalanceLocked(event: GuardianBalanceLocked): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForEvent(event.params.guardian, LOCK, event.params.amount, event)
}

export function handleGuardianBalanceUnlocked(event: GuardianBalanceUnlocked): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForEvent(event.params.guardian, UNLOCK, event.params.amount, event)
}

export function handleGuardianTokensAssigned(event: GuardianTokensAssigned): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForEvent(event.params.guardian, REWARD, event.params.amount, event)
  increaseTotalStaked(event.address, event.params.amount)
}

export function handleGuardianTokensCollected(event: GuardianTokensCollected): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForTerm(event.params.guardian, SLASH, event.params.amount, event.params.effectiveTermId, event)
  decreaseTotalActive(event.address, event.params.amount)
}

export function handleGuardianSlashed(event: GuardianSlashed): void {
  updateGuardian(event.params.guardian, event)
  createStakingMovementForTerm(event.params.guardian, SLASH, event.params.amount, event.params.effectiveTermId, event)
  decreaseTotalActive(event.address, event.params.amount)
}

function updateGuardian(guardianAddress: Address, event: ethereum.Event): void {
  const guardian = loadOrCreateGuardian(guardianAddress, event)
  const registry = GuardiansRegistry.bind(event.address)
  const balances = registry.balanceOf(guardianAddress)
  guardian.withdrawalsLockTermId = registry.getWithdrawalsLockTermId(guardianAddress)
  guardian.activeBalance = balances.value0
  guardian.availableBalance = balances.value1
  guardian.lockedBalance = balances.value2
  guardian.deactivationBalance = balances.value3
  guardian.save()
}

function createStakingMovementForEvent(guardian: Address, type: string, amount: BigInt, event: ethereum.Event): void {
  const id = buildId(event)
  createStakingMovement(id, guardian, type, amount, event.block.timestamp)
}

function createStakingMovementForTerm(guardian: Address, type: string, amount: BigInt, termId: BigInt, event: ethereum.Event): void {
  const id = buildId(event)
  createStakingMovement(id, guardian, type, amount, event.block.timestamp, termId)
}

function createStakingMovement(id: string, guardian: Address, type: string, amount: BigInt, createdAt: BigInt, termId: BigInt | null = null): void {
  const movement = new StakingMovement(id)
  movement.guardian = guardian.toHexString()
  movement.amount = amount
  movement.type = type
  movement.effectiveTermId = termId
  movement.createdAt = createdAt
  movement.save()
}

function increaseTotalStaked(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalStaked = module.totalStaked.plus(amount)
  module.save()
}

function decreaseTotalStaked(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalStaked = module.totalStaked.minus(amount)
  module.save()
}

function increaseTotalActive(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalActive = module.totalActive.plus(amount)
  module.save()
}

function decreaseTotalActive(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalActive = module.totalActive.minus(amount)
  module.save()
}

function increaseTotalDeactivation(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalDeactivation = module.totalDeactivation.plus(amount)
  module.save()
}

function decreaseTotalDeactivation(registryAddress: Address, amount: BigInt): void {
  const module = GuardiansRegistryModule.load(registryAddress.toHexString())
  module.totalDeactivation = module.totalDeactivation.minus(amount)
  module.save()
}

function loadOrCreateGuardian(guardianAddress: Address, event: ethereum.Event): Guardian {
  const id = guardianAddress.toHexString()
  let guardian = Guardian.load(id)

  if (guardian === null) {
    guardian = new Guardian(id)
    guardian.createdAt = event.block.timestamp
  }

  // The guardian may have appeared in the system but may not have activated tokens yet, meaning he doesn't have a tree ID yet
  const registry = GuardiansRegistry.bind(event.address)
  guardian.treeId = registry.getGuardianId(guardianAddress)

  return guardian!
}

export function loadOrCreateGuardiansRegistryModule(address: Address): GuardiansRegistryModule {
  let module = GuardiansRegistryModule.load(address.toHexString())

  if (module === null) {
    const registry = GuardiansRegistry.bind(address)
    module = new GuardiansRegistryModule(address.toHexString())
    module.protocol = registry.getController().toHexString()
    module.totalStaked = BigInt.fromI32(0)
    module.totalActive = BigInt.fromI32(0)
    module.totalDeactivation = BigInt.fromI32(0)
    module.save()

    const protocol = Protocol.load(module.protocol)
    protocol.token = loadOrCreateERC20(registry.token()).id
    protocol.save()
  }

  return module!
}
