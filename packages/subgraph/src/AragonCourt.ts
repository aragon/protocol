import { BigInt, Address, ethereum, log } from '@graphprotocol/graph-ts'

import { BLACKLISTED_MODULES } from '../helpers/blacklisted-modules'
import { loadOrCreateERC20 } from './ERC20'
import { loadOrCreateGuardiansRegistryModule } from './GuardiansRegistry'
import { loadOrCreatePaymentsBookModule, updateCurrentPaymentPeriod } from './PaymentsBook'

import { AragonCourt } from '../types/AragonCourt/AragonCourt'
import { CourtModule, Court, CourtTerm } from '../types/schema'
import { DisputeManager, GuardiansRegistry, Treasury, Voting, PaymentsBook } from '../types/templates'
import { Heartbeat, ModuleSet, FundsGovernorChanged, ConfigGovernorChanged, ModulesGovernorChanged } from '../types/AragonCourt/AragonCourt'

const DISPUTE_MANAGER_TYPE = 'DisputeManager'
const GUARDIANS_REGISTRY_TYPE = 'GuardiansRegistry'
const VOTING_TYPE = 'Voting'
const PAYMENTS_BOOK = 'PaymentsBook'
const TREASURY_TYPE = 'Treasury'

const DISPUTE_MANAGER_ID = '0x14a6c70f0f6d449c014c7bbc9e68e31e79e8474fb03b7194df83109a2d888ae6'
const GUARDIANS_REGISTRY_ID = '0x8af7b7118de65da3b974a3fd4b0c702b66442f74b9dff6eaed1037254c0b79fe'
const VOTING_ID = '0x7cbb12e82a6d63ff16fe43977f43e3e2b247ecd4e62c0e340da8800a48c67346'
const PAYMENTS_BOOK_ID = '0xfa275b1417437a2a2ea8e91e9fe73c28eaf0a28532a250541da5ac0d1892b418'
const TREASURY_ID = '0x06aa03964db1f7257357ef09714a5f0ca3633723df419e97015e0c7a3e83edb7'

export function handleHeartbeat(event: Heartbeat): void {
  let courtContract = AragonCourt.bind(event.address)

  let court = loadOrCreateCourt(event.address, event)
  court.currentTerm = event.params.currentTermId
  court.save()

  let previousTerm = loadOrCreateTerm(event.params.previousTermId, event)
  let previousTermData = courtContract.getTerm(event.params.previousTermId)
  previousTerm.court = event.address.toHexString()
  previousTerm.startTime = previousTermData.value0
  previousTerm.randomnessBN = previousTermData.value1
  previousTerm.randomness = previousTermData.value2
  previousTerm.save()

  let currentTerm = loadOrCreateTerm(event.params.currentTermId, event)
  let currentTermData = courtContract.getTerm(event.params.currentTermId)
  currentTerm.court = event.address.toHexString()
  currentTerm.startTime = currentTermData.value0
  currentTerm.randomnessBN = currentTermData.value1
  currentTerm.randomness = currentTermData.value2
  currentTerm.save()

  let paymentsBook = courtContract.getPaymentsBook().value0
  if (!isModuleBlacklisted(paymentsBook.toHexString())) {
    log.warning('Ignoring blacklisted module {}', [paymentsBook.toHexString()])
    updateCurrentPaymentPeriod(paymentsBook, event.block.timestamp)
  }
}

export function handleFundsGovernorChanged(event: FundsGovernorChanged): void {
  let config = loadOrCreateCourt(event.address, event)
  config.fundsGovernor = event.params.currentGovernor
  config.save()
}

export function handleConfigGovernorChanged(event: ConfigGovernorChanged): void {
  let config = loadOrCreateCourt(event.address, event)
  config.configGovernor = event.params.currentGovernor
  config.save()
}

export function handleModulesGovernorChanged(event: ModulesGovernorChanged): void {
  let config = loadOrCreateCourt(event.address, event)
  config.modulesGovernor = event.params.currentGovernor
  config.save()
}

export function handleModuleSet(event: ModuleSet): void {
  let court = Court.load(event.address.toHexString())
  let address: Address = event.params.addr
  let id: string = address.toHexString()

  if (isModuleBlacklisted(id)) {
    log.warning('Ignoring blacklisted module {}', [id])
    return
  }

  if (CourtModule.load(id) != null) {
    log.warning('Ignoring already tracked module {}', [id])
    return
  }

  let module = new CourtModule(id)
  module.court = event.address.toHexString()
  module.moduleId = event.params.id.toHexString()

  if (module.moduleId == GUARDIANS_REGISTRY_ID) {
    GuardiansRegistry.create(address)
    module.type = GUARDIANS_REGISTRY_TYPE
    loadOrCreateGuardiansRegistryModule(address)
  }
  else if (module.moduleId == DISPUTE_MANAGER_ID) {
    DisputeManager.create(address)
    module.type = DISPUTE_MANAGER_TYPE
  }
  else if (module.moduleId == VOTING_ID) {
    Voting.create(address)
    module.type = VOTING_TYPE
  }
  else if (module.moduleId == PAYMENTS_BOOK_ID) {
    PaymentsBook.create(address)
    module.type = PAYMENTS_BOOK
    loadOrCreatePaymentsBookModule(address)
  }
  else if (module.moduleId == TREASURY_ID) {
    Treasury.create(address)
    module.type = TREASURY_TYPE
  }
  else {
    module.type = 'Unknown'
  }

  court.save()
  module.save()
}

function loadOrCreateCourt(address: Address, event: ethereum.Event): Court {
  let id = address.toHexString()
  let court = Court.load(id)
  let courtContract = AragonCourt.bind(event.address)

  if (court === null) {
    court = new Court(id)
    court.currentTerm = BigInt.fromI32(0)
    court.termDuration = courtContract.getTermDuration()
  }

  let currentTermId = courtContract.getCurrentTermId()
  let configData = courtContract.getConfig(currentTermId)

  court.feeToken = loadOrCreateERC20(configData.value0).id
  court.guardianFee = configData.value1[0]
  court.draftFee = configData.value1[1]
  court.settleFee = configData.value1[2]
  court.evidenceTerms = configData.value2[0]
  court.commitTerms = configData.value2[1]
  court.revealTerms = configData.value2[2]
  court.appealTerms = configData.value2[3]
  court.appealConfirmationTerms = configData.value2[4]
  court.penaltyPct = configData.value3[0]
  court.finalRoundReduction = configData.value3[1]
  court.firstRoundGuardiansNumber = configData.value4[0]
  court.appealStepFactor = configData.value4[1]
  court.maxRegularAppealRounds = configData.value4[2]
  court.finalRoundLockTerms = configData.value4[3]
  court.appealCollateralFactor = configData.value5[0]
  court.appealConfirmCollateralFactor = configData.value5[1]
  court.minActiveBalance = configData.value6
  court.fundsGovernor = courtContract.getFundsGovernor()
  court.configGovernor = courtContract.getConfigGovernor()
  court.modulesGovernor = courtContract.getModulesGovernor()

  return court!
}

function loadOrCreateTerm(id: BigInt, event: ethereum.Event): CourtTerm {
  let term = CourtTerm.load(id.toString())

  if (term === null) {
    term = new CourtTerm(id.toString())
    term.createdAt = event.block.timestamp
  }

  return term!
}

function isModuleBlacklisted(moduleAddress: string): boolean {
  return BLACKLISTED_MODULES.includes(moduleAddress)
}
