import { BigInt, Address, ethereum, log } from '@graphprotocol/graph-ts'

import { BLACKLISTED_MODULES } from '../helpers/blacklisted-modules'
import { buildId } from '../helpers/utils'
import { loadOrCreateERC20 } from './ERC20'
import { loadOrCreateGuardiansRegistryModule } from './GuardiansRegistry'
import { loadOrCreatePaymentsBookModule, updateCurrentPaymentPeriod } from './PaymentsBook'

import { AragonProtocol } from '../types/AragonProtocol/AragonProtocol'
import { ProtocolModule, Protocol, ProtocolTerm, Evidence } from '../types/schema'
import { DisputeManager, GuardiansRegistry, Treasury, Voting, PaymentsBook } from '../types/templates'
import { Heartbeat, ModuleSet, FundsGovernorChanged, ConfigGovernorChanged, ModulesGovernorChanged, EvidenceSubmitted } from '../types/AragonProtocol/AragonProtocol'

const DISPUTE_MANAGER_TYPE = 'DisputeManager'
const GUARDIANS_REGISTRY_TYPE = 'GuardiansRegistry'
const VOTING_TYPE = 'Voting'
const TREASURY_TYPE = 'Treasury'
const PAYMENTS_BOOK = 'PaymentsBook'

const DISPUTE_MANAGER_ID = '0x14a6c70f0f6d449c014c7bbc9e68e31e79e8474fb03b7194df83109a2d888ae6'
const GUARDIANS_REGISTRY_ID = '0x8af7b7118de65da3b974a3fd4b0c702b66442f74b9dff6eaed1037254c0b79fe'
const VOTING_ID = '0x7cbb12e82a6d63ff16fe43977f43e3e2b247ecd4e62c0e340da8800a48c67346'
const TREASURY_ID = '0x06aa03964db1f7257357ef09714a5f0ca3633723df419e97015e0c7a3e83edb7'
const PAYMENTS_BOOK_ID = '0xfa275b1417437a2a2ea8e91e9fe73c28eaf0a28532a250541da5ac0d1892b418'

export function handleHeartbeat(event: Heartbeat): void {
  const protocolContract = AragonProtocol.bind(event.address)

  const protocol = loadOrCreateProtocol(event.address, event)
  protocol.currentTerm = event.params.currentTermId
  protocol.save()

  const previousTerm = loadOrCreateTerm(event.params.previousTermId, event)
  const previousTermData = protocolContract.getTerm(event.params.previousTermId)
  previousTerm.protocol = event.address.toHexString()
  previousTerm.startTime = previousTermData.value0
  previousTerm.randomnessBN = previousTermData.value1
  previousTerm.randomness = previousTermData.value2
  previousTerm.save()

  const currentTerm = loadOrCreateTerm(event.params.currentTermId, event)
  const currentTermData = protocolContract.getTerm(event.params.currentTermId)
  currentTerm.protocol = event.address.toHexString()
  currentTerm.startTime = currentTermData.value0
  currentTerm.randomnessBN = currentTermData.value1
  currentTerm.randomness = currentTermData.value2
  currentTerm.save()

  const paymentsBook = protocolContract.getPaymentsBook().value0
  if (!isModuleBlacklisted(paymentsBook.toHexString())) {
    log.warning('Ignoring blacklisted module {}', [paymentsBook.toHexString()])
    updateCurrentPaymentPeriod(paymentsBook, event.block.timestamp)
  }
}

export function handleFundsGovernorChanged(event: FundsGovernorChanged): void {
  const config = loadOrCreateProtocol(event.address, event)
  config.fundsGovernor = event.params.currentGovernor
  config.save()
}

export function handleConfigGovernorChanged(event: ConfigGovernorChanged): void {
  const config = loadOrCreateProtocol(event.address, event)
  config.configGovernor = event.params.currentGovernor
  config.save()
}

export function handleModulesGovernorChanged(event: ModulesGovernorChanged): void {
  const config = loadOrCreateProtocol(event.address, event)
  config.modulesGovernor = event.params.currentGovernor
  config.save()
}

export function handleModuleSet(event: ModuleSet): void {
  const protocol = Protocol.load(event.address.toHexString())
  const address: Address = event.params.addr
  const id: string = address.toHexString()

  if (isModuleBlacklisted(id)) {
    log.warning('Ignoring blacklisted module {}', [id])
    return
  }

  if (ProtocolModule.load(id) != null) {
    log.warning('Ignoring already tracked module {}', [id])
    return
  }

  const module = new ProtocolModule(id)
  module.protocol = event.address.toHexString()
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
  else if (module.moduleId == TREASURY_ID) {
    Treasury.create(address)
    module.type = TREASURY_TYPE
  }
  else if (module.moduleId == PAYMENTS_BOOK_ID) {
    PaymentsBook.create(address)
    module.type = PAYMENTS_BOOK
    loadOrCreatePaymentsBookModule(address)
  }
  else {
    module.type = 'Unknown'
  }

  protocol.save()
  module.save()
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

function loadOrCreateProtocol(address: Address, event: ethereum.Event): Protocol {
  const id = address.toHexString()
  let protocol = Protocol.load(id)
  const protocolContract = AragonProtocol.bind(event.address)

  if (protocol === null) {
    protocol = new Protocol(id)
    protocol.currentTerm = BigInt.fromI32(0)
    protocol.termDuration = protocolContract.getTermDuration()
  }

  const currentTermId = protocolContract.getCurrentTermId()
  const configData = protocolContract.getConfig(currentTermId)

  protocol.feeToken = loadOrCreateERC20(configData.value0).id
  protocol.guardianFee = configData.value1[0]
  protocol.draftFee = configData.value1[1]
  protocol.settleFee = configData.value1[2]
  protocol.evidenceTerms = configData.value2[0]
  protocol.commitTerms = configData.value2[1]
  protocol.revealTerms = configData.value2[2]
  protocol.appealTerms = configData.value2[3]
  protocol.appealConfirmationTerms = configData.value2[4]
  protocol.penaltyPct = configData.value3[0]
  protocol.finalRoundReduction = configData.value3[1]
  protocol.firstRoundGuardiansNumber = configData.value4[0]
  protocol.appealStepFactor = configData.value4[1]
  protocol.maxRegularAppealRounds = configData.value4[2]
  protocol.finalRoundLockTerms = configData.value4[3]
  protocol.appealCollateralFactor = configData.value5[0]
  protocol.appealConfirmCollateralFactor = configData.value5[1]
  protocol.minActiveBalance = configData.value6
  protocol.fundsGovernor = protocolContract.getFundsGovernor()
  protocol.configGovernor = protocolContract.getConfigGovernor()
  protocol.modulesGovernor = protocolContract.getModulesGovernor()

  return protocol!
}

function loadOrCreateTerm(id: BigInt, event: ethereum.Event): ProtocolTerm {
  let term = ProtocolTerm.load(id.toString())

  if (term === null) {
    term = new ProtocolTerm(id.toString())
    term.createdAt = event.block.timestamp
  }

  return term!
}

function isModuleBlacklisted(moduleAddress: string): boolean {
  return BLACKLISTED_MODULES.includes(moduleAddress)
}
