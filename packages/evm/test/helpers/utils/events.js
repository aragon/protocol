const ARBITRABLE_EVENTS = {
  RULED: 'Ruled'
}

const ARBITRATOR_EVENTS = {
  EVIDENCE_SUBMITTED: 'EvidenceSubmitted'
}

const DISPUTE_MANAGER_EVENTS = {
  DISPUTE_STATE_CHANGED: 'DisputeStateChanged',
  NEW_DISPUTE: 'NewDispute',
  GUARDIAN_DRAFTED: 'GuardianDrafted',
  EVIDENCE_PERIOD_CLOSED: 'EvidencePeriodClosed',
  RULING_APPEALED: 'RulingAppealed',
  RULING_APPEAL_CONFIRMED: 'RulingAppealConfirmed',
  RULING_COMPUTED: 'RulingComputed',
  PENALTIES_SETTLED: 'PenaltiesSettled',
  REWARD_SETTLED: 'RewardSettled',
  APPEAL_DEPOSIT_SETTLED: 'AppealDepositSettled',
  MAX_GUARDIANS_PER_DRAFT_BATCH_CHANGED: 'MaxGuardiansPerDraftBatchChanged'
}

const VOTING_EVENTS = {
  VOTING_CREATED: 'VotingCreated',
  VOTE_COMMITTED: 'VoteCommitted',
  VOTE_REVEALED: 'VoteRevealed',
  VOTE_LEAKED: 'VoteLeaked',
  DELEGATE_SET: 'DelegateSet'
}

const REGISTRY_EVENTS = {
  STAKED: 'Staked',
  UNSTAKED: 'Unstaked',
  SLASHED: 'Slashed',
  COLLECTED: 'Collected',
  GUARDIAN_ACTIVATED: 'GuardianActivated',
  GUARDIAN_DEACTIVATION_REQUESTED: 'GuardianDeactivationRequested',
  GUARDIAN_DEACTIVATION_PROCESSED: 'GuardianDeactivationProcessed',
  GUARDIAN_DEACTIVATION_UPDATED: 'GuardianDeactivationUpdated',
  GUARDIAN_BALANCE_LOCKED: 'GuardianBalanceLocked',
  GUARDIAN_BALANCE_UNLOCKED: 'GuardianBalanceUnlocked',
  GUARDIAN_SLASHED: 'GuardianSlashed',
  GUARDIAN_TOKENS_BURNED: 'GuardianTokensBurned',
  GUARDIAN_TOKENS_ASSIGNED: 'GuardianTokensAssigned',
  GUARDIAN_TOKENS_COLLECTED: 'GuardianTokensCollected',
  GUARDIAN_ACTIVATION_LOCK_CHANGED: 'GuardianActivationLockChanged',
  ACTIVATOR_CHANGED: 'ActivatorWhitelistChanged',
  LOCK_MANAGER_CHANGED: 'LockManagerWhitelistChanged',
  TOTAL_ACTIVE_BALANCE_LIMIT_CHANGED: 'TotalActiveBalanceLimitChanged'
}

const TREASURY_EVENTS = {
  ASSIGN: 'Assign',
  WITHDRAW: 'Withdraw'
}

const PAYMENTS_BOOK_EVENTS = {
  PAYMENT_RECEIVED: 'PaymentReceived',
  GUARDIAN_SHARE_CLAIMED: 'GuardianShareClaimed',
  GOVERNOR_SHARE_CLAIMED: 'GovernorShareClaimed',
  GOVERNOR_SHARE_PCT_CHANGED: 'GovernorSharePctChanged'
}

const CONTROLLER_EVENTS = {
  MODULE_SET: 'ModuleSet',
  MODULE_ENABLED: 'ModuleEnabled',
  MODULE_DISABLED: 'ModuleDisabled',
  CUSTOM_FUNCTION_SET: 'CustomFunctionSet',
  FUNDS_GOVERNOR_CHANGED: 'FundsGovernorChanged',
  CONFIG_GOVERNOR_CHANGED: 'ConfigGovernorChanged',
  MODULES_GOVERNOR_CHANGED: 'ModulesGovernorChanged'
}

const CONTROLLED_EVENTS = {
  MODULE_LINKED: 'ModuleLinked',
  RECOVER_FUNDS: 'RecoverFunds'
}

const CONFIG_EVENTS = {
  CONFIG_CHANGED: 'NewConfig'
}

const CLOCK_EVENTS = {
  HEARTBEAT: 'Heartbeat',
  START_TIME_DELAYED: 'StartTimeDelayed'
}

module.exports = {
  DISPUTE_MANAGER_EVENTS,
  VOTING_EVENTS,
  REGISTRY_EVENTS,
  TREASURY_EVENTS,
  PAYMENTS_BOOK_EVENTS,
  CONTROLLER_EVENTS,
  CONTROLLED_EVENTS,
  CONFIG_EVENTS,
  CLOCK_EVENTS,
  ARBITRATOR_EVENTS,
  ARBITRABLE_EVENTS
}
