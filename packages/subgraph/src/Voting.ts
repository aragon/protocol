import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'

import { buildDraftId, decodeDisputeRoundId, createGuardianDraft } from './DisputeManager'

import { Controller } from '../types/templates/GuardiansRegistry/Controller'
import { GuardianDraft, Vote } from '../types/schema'
import { Voting, VoteCommitted, VoteLeaked, VoteRevealed } from '../types/templates/Voting/Voting'

export function handleVoteCommitted(event: VoteCommitted): void {
  const disputeRoundId = event.params.voteId
  const draftId = buildDraftId(disputeRoundId, event.params.voter)
  const draft = loadOrCreateGuardianDraft(draftId, disputeRoundId, event.params.voter, event)
  draft.commitment = event.params.commitment
  draft.commitmentBy = event.params.sender
  draft.commitmentDate = event.block.timestamp
  draft.save()

  updateVote(event.params.voteId, event)
}

export function handleVoteLeaked(event: VoteLeaked): void {
  const roundId = event.params.voteId
  const draftId = buildDraftId(roundId, event.params.voter)
  const draft = GuardianDraft.load(draftId)
  draft.outcome = event.params.outcome
  draft.leaker = event.params.leaker
  draft.save()

  updateVote(event.params.voteId, event)
}

export function handleVoteRevealed(event: VoteRevealed): void {
  const roundId = event.params.voteId
  const draftId = buildDraftId(roundId, event.params.voter)
  const draft = GuardianDraft.load(draftId)
  draft.outcome = event.params.outcome
  draft.revealDate = event.block.timestamp
  draft.save()

  updateVote(event.params.voteId, event)
}

function updateVote(voteId: BigInt, event: ethereum.Event): void {
  const vote = loadOrCreateVote(voteId, event)
  const voting = Voting.bind(event.address)
  const winningOutcome = voting.getWinningOutcome(voteId)
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
    const voting = Voting.bind(event.address)
    const controllerAddress = voting.controller()
    const controller = Controller.bind(controllerAddress)
    const disputeManagerAddress = controller.getDisputeManager().value0
    const disputeRoundIdArray = decodeDisputeRoundId(disputeRoundId)
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
