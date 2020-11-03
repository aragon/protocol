import { Address, BigInt } from '@graphprotocol/graph-ts'

import { buildId } from '../helpers/utils'
import { loadOrCreateERC20 } from './ERC20'
import { createFeeMovement } from './Treasury'

import { GuardiansShare, PaymentReceipt, PaymentsBookModule, PaymentPeriod, GuardianShareClaim } from '../types/schema'
import { PaymentsBook, PaymentReceived, GuardianShareClaimed, GovernorSharePctChanged } from '../types/templates/PaymentsBook/PaymentsBook'

const PAYMENTS_BOOK_MOVEMENT = 'Payment'

export function handlePaymentReceived(event: PaymentReceived): void {
  updateCurrentPaymentPeriod(event.address, event.block.timestamp, event.params.token)

  const id = buildId(event)
  const payment = new PaymentReceipt(id)
  payment.token = loadOrCreateERC20(event.params.token).id
  payment.period = event.params.periodId.toString()
  payment.payer = event.params.payer
  payment.sender = event.transaction.from
  payment.amount = event.params.amount
  payment.data = event.params.data
  payment.createdAt = event.block.timestamp
  payment.save()
}

export function handleGuardianShareClaimed(event: GuardianShareClaimed): void {
  updateCurrentPaymentPeriod(event.address, event.block.timestamp, event.params.token)
  createFeeMovement(PAYMENTS_BOOK_MOVEMENT, event.params.guardian, event.params.amount, event)

  const shareId = buildGuardianShareId(event.params.guardian, event.params.token, event.params.periodId)
  const shareClaim = new GuardianShareClaim(shareId)
  shareClaim.guardian = event.params.guardian.toHexString()
  shareClaim.period = event.params.periodId.toString()
  shareClaim.token = event.params.token.toHexString()
  shareClaim.amount = event.params.amount
  shareClaim.save()
}

export function handleGovernorSharePctChanged(event: GovernorSharePctChanged): void {
  const module = loadOrCreatePaymentsBookModule(event.address)
  module.governorSharePct = BigInt.fromI32(event.params.currentGovernorSharePct)
  module.save()
}

export function updateCurrentPaymentPeriod(address: Address, timestamp: BigInt, token: Address | null = null): void {
  const paymentsBook = PaymentsBook.bind(address)
  const periodId = paymentsBook.getCurrentPeriodId()

  const paymentsBookModule = loadOrCreatePaymentsBookModule(address)
  paymentsBookModule.currentPeriod = periodId
  paymentsBookModule.save()

  const period = loadOrCreatePaymentPeriod(periodId, timestamp)
  const periodData = paymentsBook.getPeriodBalanceDetails(periodId)
  period.book = address.toHexString()
  period.balanceCheckpoint = periodData.value0
  period.totalActiveBalance = periodData.value1
  period.save()

  if (token != null) {
    const sharesData = paymentsBook.getPeriodShares(periodId, token!)
    let guardiansShare = GuardiansShare.load(periodId.toString())
    if (guardiansShare == null) guardiansShare = new GuardiansShare(periodId.toString())
    guardiansShare.book = address.toHexString()
    guardiansShare.token = token!.toHexString()
    guardiansShare.amount = sharesData.value0
    guardiansShare.period = periodId.toString()
    guardiansShare.save()
  }
}

function loadOrCreatePaymentPeriod(periodId: BigInt, timestamp: BigInt): PaymentPeriod {
  let id = periodId.toString()
  let period = PaymentPeriod.load(id)

  if (period === null) {
    period = new PaymentPeriod(id)
    period.createdAt = timestamp
    period.balanceCheckpoint = BigInt.fromI32(0)
    period.totalActiveBalance = BigInt.fromI32(0)
  }

  return period!
}

export function loadOrCreatePaymentsBookModule(address: Address): PaymentsBookModule {
  let module = PaymentsBookModule.load(address.toHexString())

  if (module === null) {
    const paymentsBook = PaymentsBook.bind(address)
    module = new PaymentsBookModule(address.toHexString())
    module.protocol = paymentsBook.controller().toHexString()
    module.currentPeriod = BigInt.fromI32(0)
    module.governorSharePct = BigInt.fromI32(paymentsBook.governorSharePct())
    module.periodDuration = paymentsBook.periodDuration()
    module.save()
  }

  return module!
}

function buildGuardianShareId(guardian: Address, token: Address, periodId: BigInt): string {
  return guardian.toHexString().concat(periodId.toString()).concat(token.toHexString())
}
