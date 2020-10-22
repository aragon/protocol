import { crypto, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'

import { buildId, concat } from '../helpers/utils'
import { FeeMovement, TreasuryBalance } from '../types/schema'
import { Assign, Withdraw, Treasury } from '../types/templates/Treasury/Treasury'

const WITHDRAW_MOVEMENT = 'Withdraw'

export function handleAssign(event: Assign): void {
  updateTreasuryBalance(event.params.to, event.params.token, event)
}

export function handleWithdraw(event: Withdraw): void {
  createFeeMovement(WITHDRAW_MOVEMENT, event.params.from, event.params.amount, event)
  updateTreasuryBalance(event.params.from, event.params.token, event)
}

export function createFeeMovement(type: string, owner: Address, amount: BigInt, event: ethereum.Event, id: string | null = null): void {
  const feeId = id === null ? buildId(event) : id
  const movement = new FeeMovement(feeId)
  movement.type = type
  movement.owner = owner
  movement.amount = amount
  movement.createdAt = event.block.timestamp
  movement.save()
}

function updateTreasuryBalance(owner: Address, token: Address, event: ethereum.Event): void {
  const treasuryBalance = loadOrCreateTreasuryBalance(owner, token)
  const treasury = Treasury.bind(event.address)
  treasuryBalance.amount = treasury.balanceOf(token, owner)
  treasuryBalance.save()
}

function loadOrCreateTreasuryBalance(owner: Address, token: Address): TreasuryBalance {
  const id = buildTreasuryBalanceId(owner, token)
  let treasuryBalance = TreasuryBalance.load(id)

  if (treasuryBalance === null) {
    treasuryBalance = new TreasuryBalance(id)
    treasuryBalance.token = token.toHexString()
    treasuryBalance.owner = owner
  }

  return treasuryBalance!
}

function buildTreasuryBalanceId(owner: Address, token: Address): string {
  return crypto.keccak256(concat(owner, token)).toHexString()
}
