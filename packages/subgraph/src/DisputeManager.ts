import { crypto, Bytes, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'

import { buildId, concat } from '../helpers/utils'
import { createFeeMovement } from './Treasury'
import { tryDecodingAgreementMetadata } from '../helpers/disputable'

import { AdjudicationRound, Dispute, Evidence, Appeal, GuardianDispute, GuardianDraft } from '../types/schema'
import { DisputeManager, NewDispute, EvidenceSubmitted, EvidencePeriodClosed, GuardianDrafted, DisputeStateChanged, PenaltiesSettled, RewardSettled, AppealDepositSettled, RulingAppealed, RulingAppealConfirmed, RulingComputed } from '../types/templates/DisputeManager/DisputeManager'

const APPEAL_MOVEMENT = 'Appeal'
const DISPUTE_MOVEMENT = 'Dispute'

let UINT128 = BigInt.fromI32(2).pow(128)

export function handleNewDispute(event: NewDispute): void {
  let manager = DisputeManager.bind(event.address)
  let dispute = new Dispute(event.params.disputeId.toString())
  let disputeData = manager.getDispute(event.params.disputeId)
  dispute.subject = event.params.subject
  dispute.metadata = event.params.metadata.toString()
  dispute.rawMetadata = event.params.metadata
  dispute.possibleRulings = disputeData.value1
  dispute.state = 'Evidence'
  dispute.settledPenalties = false
  dispute.finalRuling = disputeData.value3
  dispute.lastRoundId = disputeData.value4
  dispute.createTermId = disputeData.value5
  dispute.createdAt = event.block.timestamp
  dispute.txHash = event.transaction.hash.toHexString()
  dispute.save()

  updateRound(event.params.disputeId, dispute.lastRoundId, event)
  tryDecodingAgreementMetadata(dispute)
}

export function handleEvidenceSubmitted(event: EvidenceSubmitted): void {
  let id = buildId(event)
  let evidence = new Evidence(id)
  evidence.dispute = event.params.disputeId.toString()
  evidence.data = event.params.evidence
  evidence.submitter = event.params.submitter
  evidence.createdAt = event.block.timestamp
  evidence.save()
}

export function handleEvidencePeriodClosed(event: EvidencePeriodClosed): void {
  let dispute = Dispute.load(event.params.disputeId.toString())
  dispute.state = 'Drafting'
  dispute.save()

  updateRound(event.params.disputeId, dispute.lastRoundId, event)
}

export function handleGuardianDrafted(event: GuardianDrafted): void {
  createGuardianDraft(event.address, event.params.disputeId, event.params.roundId, event.params.guardian, event.block.timestamp)
  loadOrCreateGuardianDispute(event.params.disputeId, event.params.guardian)
  updateRound(event.params.disputeId, event.params.roundId, event)
}

export function handleDisputeStateChanged(event: DisputeStateChanged): void {
  let dispute = Dispute.load(event.params.disputeId.toString())
  dispute.state = castDisputeState(event.params.state)
  dispute.save()

  updateRound(event.params.disputeId, dispute.lastRoundId, event)

  if (event.params.state === 1) { // Adjudicating
    let round = loadOrCreateRound(event.params.disputeId, dispute.lastRoundId, event)
    round.draftedTermId = round.draftTermId.plus(round.delayedTerms)
    round.save()
  }
}

export function handleRulingAppealed(event: RulingAppealed): void {
  updateRound(event.params.disputeId, event.params.roundId, event)
  updateAppeal(event.params.disputeId, event.params.roundId, event)
}

export function handleRulingAppealConfirmed(event: RulingAppealConfirmed): void {
  let manager = DisputeManager.bind(event.address)
  let dispute = new Dispute(event.params.disputeId.toString())
  let disputeData = manager.getDispute(event.params.disputeId)
  dispute.state = castDisputeState(disputeData.value2)
  dispute.lastRoundId = disputeData.value4
  dispute.save()

  // RulingAppealConfirmed returns next roundId so in order to update the appeal we need the previous round
  updateAppeal(event.params.disputeId, event.params.roundId.minus(BigInt.fromI32(1)), event)
  updateRound(event.params.disputeId, dispute.lastRoundId, event)
}

export function handlePenaltiesSettled(event: PenaltiesSettled): void {
  updateRound(event.params.disputeId, event.params.roundId, event)

  let dispute = Dispute.load(event.params.disputeId.toString())

  // In cases where the penalties are settled before the ruling is executed
  if (dispute.finalRuling === 0) {
    let manager = DisputeManager.bind(event.address)
    let disputeData = manager.getDispute(event.params.disputeId)
    dispute.finalRuling = disputeData.value3
  }

  // Update dispute settled penalties if needed
  if (dispute.lastRoundId == event.params.roundId) {
    dispute.settledPenalties = true
  }

  // Create movements for appeal fees if there were no coherent guardians
  createAppealFeesForGuardianFees(event, event.params.disputeId)
  dispute.save()
}

export function handleRewardSettled(event: RewardSettled): void {
  updateRound(event.params.disputeId, event.params.roundId, event)

  let roundId = buildRoundId(event.params.disputeId, event.params.roundId)
  let draft = GuardianDraft.load(buildDraftId(roundId, event.params.guardian))
  draft.rewarded = true
  draft.rewardedAt = event.block.timestamp
  draft.save()

  createFeeMovement(DISPUTE_MOVEMENT, event.params.guardian, event.params.fees, event)
}

export function handleAppealDepositSettled(event: AppealDepositSettled): void {
  let appealId = buildAppealId(event.params.disputeId, event.params.roundId)
  let appeal = Appeal.load(appealId.toString())
  appeal.settled = true
  appeal.settledAt = event.block.timestamp
  appeal.save()

  createAppealFeesForDeposits(event.params.disputeId, event.params.roundId, appealId, event)
}

export function handleRulingComputed(event: RulingComputed): void {
  let dispute = Dispute.load(event.params.disputeId.toString())
  dispute.state = 'Ruled'
  dispute.finalRuling = event.params.ruling
  dispute.ruledAt = event.block.timestamp
  dispute.save()
}

function updateRound(disputeId: BigInt, roundNumber: BigInt, event: ethereum.Event): void {
  let round = loadOrCreateRound(disputeId, roundNumber, event)
  let manager = DisputeManager.bind(event.address)
  let roundData = manager.getRound(disputeId, roundNumber)
  round.number = roundNumber
  round.dispute = disputeId.toString()
  round.draftTermId = roundData.value0
  round.delayedTerms = roundData.value1
  round.guardiansNumber = roundData.value2
  round.selectedGuardians = roundData.value3
  round.guardianFees = roundData.value4
  round.settledPenalties = roundData.value5
  round.collectedTokens = roundData.value6
  round.coherentGuardians = roundData.value7
  round.state = castAdjudicationState(roundData.value8)
  round.stateInt = roundData.value8
  round.save()
}

function loadOrCreateRound(disputeId: BigInt, roundNumber: BigInt, event: ethereum.Event): AdjudicationRound {
  let id = buildRoundId(disputeId, roundNumber).toString()
  let round = AdjudicationRound.load(id)

  if (round === null) {
    round = new AdjudicationRound(id)
    round.vote = id
    round.createdAt = event.block.timestamp
  }

  return round!
}

function loadOrCreateGuardianDispute(disputeId: BigInt, guardian: Address): GuardianDispute {
  let id = buildGuardianDisputeId(disputeId, guardian).toString()
  let guardianDispute = GuardianDispute.load(id)

  if (guardianDispute === null) {
    guardianDispute = new GuardianDispute(id)
    guardianDispute.dispute = disputeId.toString()
    guardianDispute.guardian = guardian.toHexString()
    guardianDispute.save()
  }

  return guardianDispute!
}

function updateAppeal(disputeId: BigInt, roundNumber: BigInt, event: ethereum.Event): void {
  let appeal = loadOrCreateAppeal(disputeId, roundNumber, event)
  let manager = DisputeManager.bind(event.address)
  let appealData = manager.getAppeal(disputeId, roundNumber)
  let nextRound = manager.getNextRoundDetails(disputeId, roundNumber)

  appeal.round = buildRoundId(disputeId, roundNumber).toString()
  appeal.maker = appealData.value0
  appeal.appealedRuling = appealData.value1
  appeal.taker = appealData.value2
  appeal.opposedRuling = appealData.value3
  appeal.settled = false
  appeal.appealDeposit = nextRound.value6
  appeal.confirmAppealDeposit = nextRound.value7
  if (appeal.opposedRuling.gt(BigInt.fromI32(0))) {
    appeal.confirmedAt = event.block.timestamp
  }

  appeal.save()
}

function createAppealFeesForDeposits(disputeId: BigInt, roundNumber: BigInt, appealId: BigInt, event: ethereum.Event): void {
  let appeal = Appeal.load(appealId.toString())
  let manager = DisputeManager.bind(event.address)
  let nextRound = manager.getNextRoundDetails(disputeId, roundNumber)
  let totalFees = nextRound.value4

  let maker = Address.fromString(appeal.maker.toHexString())
  let taker = Address.fromString(appeal.taker.toHexString())
  let totalDeposit = appeal.appealDeposit.plus(appeal.confirmAppealDeposit)

  let dispute = Dispute.load(disputeId.toString())
  let finalRuling = BigInt.fromI32(dispute.finalRuling)

  if (appeal.appealedRuling == finalRuling) {
    createFeeMovement(APPEAL_MOVEMENT, maker, totalDeposit.minus(totalFees), event)
  } else if (appeal.opposedRuling == finalRuling) {
    createFeeMovement(APPEAL_MOVEMENT, taker, totalDeposit.minus(totalFees), event)
  } else {
    let feesRefund = totalFees.div(BigInt.fromI32(2))
    let id = buildId(event)
    createFeeMovement(APPEAL_MOVEMENT, maker, appeal.appealDeposit.minus(feesRefund), event, id.concat('-maker'))
    createFeeMovement(APPEAL_MOVEMENT, taker, appeal.confirmAppealDeposit.minus(feesRefund), event, id.concat('-taker'))
  }
}

function createAppealFeesForGuardianFees(event: PenaltiesSettled, disputeId: BigInt): void {
  let dispute = Dispute.load(disputeId.toString())
  let roundId = buildRoundId(event.params.disputeId, event.params.roundId).toString()
  let round = AdjudicationRound.load(roundId)
  if (round.coherentGuardians.isZero()) {
    if (event.params.roundId.isZero()) {
      createFeeMovement(DISPUTE_MOVEMENT, Address.fromString(dispute.subject.toHexString()), round.guardianFees, event)
    } else {
      let previousRoundId = event.params.roundId.minus(BigInt.fromI32(1))
      let appealId = buildAppealId(event.params.disputeId, previousRoundId).toString()
      let appeal = Appeal.load(appealId)
      let refundFees = round.guardianFees.div(BigInt.fromI32(2))
      let id = buildId(event)
      createFeeMovement(APPEAL_MOVEMENT, Address.fromString(appeal.maker.toHexString()), refundFees, event, id.concat('-maker'))
      createFeeMovement(APPEAL_MOVEMENT, Address.fromString(appeal.taker.toHexString()), refundFees, event, id.concat('-taker'))
    }
  }
}

function loadOrCreateAppeal(disputeId: BigInt, roundNumber: BigInt, event: ethereum.Event): Appeal {
  let id = buildAppealId(disputeId, roundNumber).toString()
  let appeal = Appeal.load(id)

  if (appeal === null) {
    appeal = new Appeal(id)
    appeal.createdAt = event.block.timestamp
  }

  return appeal!
}

export function createGuardianDraft(disputeManagerAddress: Address, disputeId: BigInt, roundId: BigInt, guardianAddress: Address, timestamp: BigInt): GuardianDraft {
  let manager = DisputeManager.bind(disputeManagerAddress)
  let response = manager.getGuardian(disputeId, roundId, guardianAddress)
  let disputeRoundId = buildRoundId(disputeId, roundId)
  let draftId = buildDraftId(disputeRoundId, guardianAddress)
  let draft = new GuardianDraft(draftId)
  draft.round = disputeRoundId.toString()
  draft.guardian = guardianAddress.toHexString()
  draft.locked = BigInt.fromI32(0) // will be updated in GuardianLockedBalance event handler
  draft.weight = response.value0
  draft.rewarded = response.value1
  draft.createdAt = timestamp
  draft.save()
  return draft!
}

export function buildRoundId(disputeId: BigInt, roundNumber: BigInt): BigInt {
  return BigInt.fromI32(2).pow(128).times(disputeId).plus(roundNumber)
}

export function decodeDisputeRoundId(disputeRoundId: BigInt): BigInt[] {
  let disputeId = disputeRoundId.div(UINT128)
  let roundId = disputeRoundId.mod(UINT128)

  return [disputeId, roundId]
}

export function buildDraftId(roundId: BigInt, guardian: Address): string {
  // @ts-ignore BigInt is actually a BytesArray under the hood
  return crypto.keccak256(concat(roundId as Bytes, guardian)).toHexString()
}

export function buildGuardianDisputeId(disputeId: BigInt, guardian: Address): string {
  // @ts-ignore BigInt is actually a BytesArray under the hood
  return crypto.keccak256(concat(disputeId as Bytes, guardian)).toHexString()
}

function buildAppealId(disputeId: BigInt, roundId: BigInt): BigInt {
  // There can be only one appeal per dispute round, seems safe doing the same math
  return buildRoundId(disputeId, roundId)
}

function castDisputeState(state: i32): string {
  switch (state) {
    case 0: return 'Drafting'
    case 1: return 'Adjudicating'
    case 2: return 'Ruled'
    default: return 'Unknown'
  }
}

function castAdjudicationState(state: i32): string {
  switch (state) {
    case 0: return 'Invalid'
    case 1: return 'Committing'
    case 2: return 'Revealing'
    case 3: return 'Appealing'
    case 4: return 'ConfirmingAppeal'
    case 5: return 'Ended'
    default: return 'Unknown'
  }
}
