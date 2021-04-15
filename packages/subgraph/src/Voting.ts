import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'

import { buildDraftId, decodeDisputeRoundId, createGuardianDraft } from './DisputeManager'

import { Controller } from '../types/templates/GuardiansRegistry/Controller'
import { GuardianDraft, Vote } from '../types/schema'
import { Voting, VoteCommitted, VoteLeaked, VoteRevealed } from '../types/templates/Voting/Voting'

export function handleVoteCommitted(event: VoteCommitted): void {
  let disputeRoundId = event.params.voteId
  let draftId = buildDraftId(disputeRoundId, event.params.voter)
  let draft = loadOrCreateGuardianDraft(draftId, disputeRoundId, event.params.voter, event)
  draft.commitment = event.params.commitment
  draft.commitmentBy = event.transaction.from
  draft.commitmentDate = event.block.timestamp
  draft.save()

  updateVote(event.params.voteId, event)
}

export function handleVoteLeaked(event: VoteLeaked): void {
  let roundId = event.params.voteId
  let draftId = buildDraftId(roundId, event.params.voter)
  let draft = GuardianDraft.load(draftId)
  draft.outcome = event.params.outcome
  draft.leaker = event.transaction.from
  draft.save()

  updateVote(event.params.voteId, event)
}

export function handleVoteRevealed(event: VoteRevealed): void {
  let roundId = event.params.voteId
  let draftId = buildDraftId(roundId, event.params.voter)
  let draft = GuardianDraft.load(draftId)
  draft.outcome = event.params.outcome
  draft.revealDate = event.block.timestamp
  draft.save()

  updateVote(event.params.voteId, event)
}

function updateVote(voteId: BigInt, event: ethereum.Event): void {
  let vote = loadOrCreateVote(voteId, event)
  let voting = Voting.bind(event.address)
  let winningOutcome = voting.getWinningOutcome(voteId)
  vote.winningOutcome = castOutcome(winningOutcome)
  vote.save()
}

function loadOrCreateVote(voteId: BigInt, event: ethereum.Event): Vote {
  let vote = Vote.load(voteId.toString())

  if (vote === null) {
    vote = new Vote(voteId.toString())
    vote.createdAt = event.block.timestamp
  }

  return vote!
}

function loadOrCreateGuardianDraft(draftId: string, disputeRoundId: BigInt, guardianAddress: Address, event: ethereum.Event): GuardianDraft {
  let draft = GuardianDraft.load(draftId)

  if (draft === null) {
    let voting = Voting.bind(event.address)
    let controllerAddress = voting.controller()
    let controller = Controller.bind(controllerAddress)
    let disputeManagerAddress = controller.getDisputeManager().value0
    let disputeRoundIdArray = decodeDisputeRoundId(disputeRoundId)
    draft = createGuardianDraft(disputeManagerAddress, disputeRoundIdArray[0], disputeRoundIdArray[1], guardianAddress, event.block.timestamp)
  }

  return draft!
}

function castOutcome(outcome: i32): string {
  switch (outcome) {
    case 0: return 'Missing'
    case 1: return 'Leaked'
    case 2: return 'Refused'
    case 3: return 'Against'
    case 4: return 'InFavor'
    default: return 'Unknown'
  }
}
