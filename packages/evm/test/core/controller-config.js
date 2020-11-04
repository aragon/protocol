const { NOW, ONE_DAY, bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { CONFIG_EVENTS } = require('../helpers/utils/events')
const { assertConfig, buildNewConfig } = require('../helpers/utils/config')
const { CLOCK_ERRORS, CONFIG_ERRORS, CONTROLLER_ERRORS } = require('../helpers/utils/errors')

contract('Controller', ([_, configGovernor, someone, drafter, appealMaker, appealTaker, guardian500, guardian1000, guardian3000]) => {
  let protocolHelper, controller

  let initialConfig, feeToken
  const guardianFee = bigExp(10, 18)
  const draftFee = bigExp(30, 18)
  const settleFee = bigExp(40, 18)
  const evidenceTerms = bn(1)
  const commitTerms = bn(1)
  const revealTerms = bn(2)
  const appealTerms = bn(3)
  const appealConfirmTerms = bn(4)
  const penaltyPct = bn(100)
  const finalRoundReduction = bn(3300)
  const firstRoundGuardiansNumber = bn(5)
  const appealStepFactor = bn(3)
  const maxRegularAppealRounds = bn(2)
  const finalRoundLockTerms = bn(2)
  const appealCollateralFactor = bn(4)
  const appealConfirmCollateralFactor = bn(6)
  const minActiveBalance = bigExp(200, 18)

  const checkConfig = async (termId, expectedConfig) => assertConfig(await protocolHelper.getConfig(termId), expectedConfig)

  before('set initial config', async () => {
    feeToken = await artifacts.require('ERC20Mock').new('Protocol Fee Token', 'CFT', 18)
    initialConfig = {
      feeToken,
      guardianFee,
      draftFee,
      settleFee,
      evidenceTerms,
      commitTerms,
      revealTerms,
      appealTerms,
      appealConfirmTerms,
      penaltyPct,
      finalRoundReduction,
      firstRoundGuardiansNumber,
      appealStepFactor,
      maxRegularAppealRounds,
      finalRoundLockTerms,
      appealCollateralFactor,
      appealConfirmCollateralFactor,
      minActiveBalance
    }
  })

  beforeEach('create helper', () => {
    protocolHelper = buildHelper()
  })

  describe('constructor', () => {
    context('when the initialization succeeds', () => {
      beforeEach('deploy controller', async () => {
        controller = await protocolHelper.deploy(initialConfig)
      })

      it('sets configuration properly', async () => {
        await checkConfig(0, initialConfig)
      })
    })

    context('when the initialization fails', () => {
      it('cannot use a term duration greater than the first term start time', async () => {
        await assertRevert(protocolHelper.deploy({ mockedTimestamp: NOW, firstTermStartTime: ONE_DAY, termDuration: ONE_DAY + 1 }), CLOCK_ERRORS.BAD_FIRST_TERM_START_TIME)
      })

      it('cannot use a first term start time in the past', async () => {
        await assertRevert(protocolHelper.deploy({ mockedTimestamp: NOW, firstTermStartTime: NOW - 1, termDuration: ONE_DAY }), CLOCK_ERRORS.BAD_FIRST_TERM_START_TIME)
      })

      it('cannot use a penalty pct above 100%', async () => {
        await assertRevert(protocolHelper.deploy({ penaltyPct: bn(10001) }), CONFIG_ERRORS.INVALID_PENALTY_PCT)
      })

      it('cannot use a final round reduction above 100%', async () => {
        await assertRevert(protocolHelper.deploy({ finalRoundReduction: bn(10001) }), CONFIG_ERRORS.INVALID_FINAL_ROUND_REDUCTION_PCT)
      })

      it('cannot use an appeal collateral factor zero', async () => {
        await assertRevert(protocolHelper.deploy({ appealCollateralFactor: bn(0) }), CONFIG_ERRORS.ZERO_COLLATERAL_FACTOR)
      })

      it('cannot use an appeal confirmation collateral factor zero', async () => {
        await assertRevert(protocolHelper.deploy({ appealConfirmCollateralFactor: bn(0) }), CONFIG_ERRORS.ZERO_COLLATERAL_FACTOR)
      })

      it('cannot use an initial guardians number zero', async () => {
        await assertRevert(protocolHelper.deploy({ firstRoundGuardiansNumber: bn(0) }), CONFIG_ERRORS.BAD_INITIAL_GUARDIANS_NUMBER)
      })

      it('cannot use an appeal step factor zero', async () => {
        await assertRevert(protocolHelper.deploy({ appealStepFactor: bn(0) }), CONFIG_ERRORS.BAD_APPEAL_STEP_FACTOR)
      })

      it('cannot use a max appeal rounds zero', async () => {
        await assertRevert(protocolHelper.deploy({ maxRegularAppealRounds: bn(0) }), CONFIG_ERRORS.INVALID_MAX_APPEAL_ROUNDS)
      })

      it('cannot use a max appeal rounds above 10', async () => {
        await assertRevert(protocolHelper.deploy({ maxRegularAppealRounds: bn(11) }), CONFIG_ERRORS.INVALID_MAX_APPEAL_ROUNDS)
      })

      it('cannot use a adjudication round durations zero', async () => {
        await assertRevert(protocolHelper.deploy({ evidenceTerms: bn(0) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ commitTerms: bn(0) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ revealTerms: bn(0) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ appealTerms: bn(0) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ appealConfirmTerms: bn(0) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
      })

      it('cannot use a adjudication round durations bigger than 8670 terms', async () => {
        await assertRevert(protocolHelper.deploy({ evidenceTerms: bn(8760) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ commitTerms: bn(8760) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ revealTerms: bn(8760) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ appealTerms: bn(8760) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
        await assertRevert(protocolHelper.deploy({ appealConfirmTerms: bn(8760) }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
      })

      it('cannot use a min active balance 0', async () => {
        await assertRevert(protocolHelper.deploy({ minActiveBalance: bn(0) }), CONFIG_ERRORS.ZERO_MIN_ACTIVE_BALANCE)
      })
    })
  })

  describe('setConfig', () => {
    let newConfig

    beforeEach('deploy controller and build new config', async () => {
      controller = await protocolHelper.deploy({ ...initialConfig, configGovernor })
      newConfig = await buildNewConfig(initialConfig)
    })

    context('when the sender is the governor', () => {
      const from = configGovernor

      const itHandlesConfigChangesProperly = (configChangeTermId, handleDisputes) => {
        context('when there was no config change scheduled before', () => {
          context('when the new config is valid', () => {
            let receipt

            beforeEach('change protocol config', async () => {
              receipt = await protocolHelper.setConfig(configChangeTermId, newConfig, { from })
            })

            it('check it from the past', async () => {
              await checkConfig(configChangeTermId, newConfig)
            })

            it('emits an event', async () => {
              assertAmountOfEvents(receipt, CONFIG_EVENTS.CONFIG_CHANGED)
              assertEvent(receipt, CONFIG_EVENTS.CONFIG_CHANGED, { expectedArgs: { fromTermId: configChangeTermId, protocolConfigId: 2 } })
            })

            it('schedules the new config properly', async () => {
              const scheduledTermId = await controller.getConfigChangeTermId()

              assertBn(scheduledTermId, configChangeTermId, 'config change term id does not match')
            })

            it('check once the change term id has been reached', async () => {
              // move forward to the scheduled term
              await protocolHelper.setTerm(configChangeTermId)

              await checkConfig(configChangeTermId, newConfig)
            })

            if (handleDisputes) {
              it('does not affect a dispute during its lifetime', async () => {
                // activate guardians
                await protocolHelper.activate([
                  { address: guardian3000, initialActiveBalance: bigExp(3000, 18) },
                  { address: guardian500,  initialActiveBalance: bigExp(500, 18) },
                  { address: guardian1000, initialActiveBalance: bigExp(1000, 18) }
                ])

                // move right before the config change and create a dispute
                await protocolHelper.setTerm(configChangeTermId - 1)
                const disputeId = await protocolHelper.dispute()

                // check dispute config related info
                const { roundGuardiansNumber, guardianFees } = await protocolHelper.getRound(disputeId, 0)
                assertBn(roundGuardiansNumber, firstRoundGuardiansNumber, 'guardians number does not match')
                assertBn(guardianFees, firstRoundGuardiansNumber.mul(guardianFee), 'guardians fees do not match')

                // draft, commit, and reveal
                const draftedGuardians = await protocolHelper.draft({ disputeId, drafter })
                await protocolHelper.commit({ disputeId, roundId: 0, voters: draftedGuardians })
                await protocolHelper.reveal({ disputeId, roundId: 0, voters: draftedGuardians })

                // appeal and confirm
                await protocolHelper.appeal({ disputeId, roundId: 0, appealMaker })
                await protocolHelper.confirmAppeal({ disputeId, roundId: 0, appealTaker })

                // check dispute config related info
                const { roundGuardiansNumber: appealGuardiansNumber, guardianFees: appealGuardianFees } = await protocolHelper.getRound(disputeId, 1)
                assertBn(appealGuardiansNumber, firstRoundGuardiansNumber.mul(appealStepFactor), 'guardians Number does not match')
                assertBn(appealGuardianFees, appealGuardiansNumber.mul(guardianFee), 'guardians Fees do not match')
              })
            }
          })

          context('when the new config is not valid', () => {
            it('cannot use a penalty pct above 100%', async () => {
              newConfig.penaltyPct = bn(10001)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.INVALID_PENALTY_PCT)
            })

            it('cannot use a final round reduction above 100%', async () => {
              newConfig.finalRoundReduction = bn(10001)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.INVALID_FINAL_ROUND_REDUCTION_PCT)
            })

            it('cannot use an appeal collateral factor zero', async () => {
              newConfig.appealCollateralFactor = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.ZERO_COLLATERAL_FACTOR)
            })

            it('cannot use an appeal confirmation collateral factor zero', async () => {
              newConfig.appealConfirmCollateralFactor = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.ZERO_COLLATERAL_FACTOR)
            })

            it('cannot use an initial guardians number zero', async () => {
              newConfig.firstRoundGuardiansNumber = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.BAD_INITIAL_GUARDIANS_NUMBER)
            })

            it('cannot use an appeal step factor zero', async () => {
              newConfig.appealStepFactor = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.BAD_APPEAL_STEP_FACTOR)
            })

            it('cannot use a max appeal rounds zero', async () => {
              newConfig.maxRegularAppealRounds = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.INVALID_MAX_APPEAL_ROUNDS)
            })

            it('cannot use a max appeal rounds above 10', async () => {
              newConfig.maxRegularAppealRounds = bn(11)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.INVALID_MAX_APPEAL_ROUNDS)
            })

            it('cannot use a adjudication round durations zero', async () => {
              newConfig.evidenceTerms = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.commitTerms = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.revealTerms = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.appealTerms = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.appealConfirmTerms = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
            })

            it('cannot use a adjudication round durations bigger than 8670 terms', async () => {
              newConfig.evidenceTerms = bn(8760)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.commitTerms = bn(8760)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.revealTerms = bn(8760)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.appealTerms = bn(8760)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)

              newConfig.appealConfirmTerms = bn(8760)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.LARGE_ROUND_PHASE_DURATION)
            })

            it('cannot use a min active balance 0', async () => {
              newConfig.minActiveBalance = bn(0)
              await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.ZERO_MIN_ACTIVE_BALANCE)
            })
          })
        })

        context('when there was a config change already scheduled', () => {
          let previousScheduledConfig
          const previousConfigChangeTermId = configChangeTermId + 1

          beforeEach('schedule config and build new config change', async () => {
            previousScheduledConfig = newConfig
            newConfig = await buildNewConfig(previousScheduledConfig)
            await protocolHelper.setConfig(previousConfigChangeTermId, newConfig, { from })
          })

          context('when overwriting changes at a later term', () => {
            const newConfigChangeTermId = previousConfigChangeTermId + 1

            beforeEach('change protocol config', async () => {
              await protocolHelper.setConfig(newConfigChangeTermId, newConfig, { from })
            })

            it('check it from the past', async () => {
              await checkConfig(previousConfigChangeTermId, initialConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })

            it('check once the change term id for the first change has been reached', async () => {
              // move forward to the previous scheduled term ID
              await protocolHelper.setTerm(previousConfigChangeTermId)

              await checkConfig(previousConfigChangeTermId, initialConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })

            it('check once the change term id for the second change has been reached', async () => {
              // move forward to the new scheduled term ID
              await protocolHelper.setTerm(newConfigChangeTermId)

              await checkConfig(previousConfigChangeTermId, initialConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })
          })

          context('when overwriting changes at a prior term', () => {
            const newConfigChangeTermId = previousConfigChangeTermId - 1

            beforeEach('change protocol config', async () => {
              await protocolHelper.setConfig(newConfigChangeTermId, newConfig, { from })
            })

            it('check it from the past', async () => {
              await checkConfig(previousConfigChangeTermId, newConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })

            it('check once the change term id for the first change has been reached', async () => {
              // move forward to the previous scheduled term ID
              await protocolHelper.setTerm(previousConfigChangeTermId)

              await checkConfig(previousConfigChangeTermId, newConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })

            it('check once the change term id for the second change has been reached', async () => {
              // move forward to the new scheduled term ID
              await protocolHelper.setTerm(newConfigChangeTermId)

              await checkConfig(previousConfigChangeTermId, newConfig)
              await checkConfig(newConfigChangeTermId, newConfig)
            })
          })
        })
      }

      context('when the protocol is at term #0', () => {
        const currentTerm = 0
        const handleDisputes = false

        context('when scheduling a config one term in the future', () => {
          const configChangeTermId = currentTerm + 1

          itHandlesConfigChangesProperly(configChangeTermId, handleDisputes)
        })

        context('when scheduling a config for the current term', () => {
          const configChangeTermId = currentTerm

          itHandlesConfigChangesProperly(configChangeTermId, handleDisputes)
        })
      })

      context('when the protocol is after term #1', () => {
        const currentTerm = 1

        beforeEach('move to term #1', async () => {
          await protocolHelper.setTerm(currentTerm)
        })

        context('when scheduling a config one term in the future', () => {
          const handleDisputes = true
          const configChangeTermId = currentTerm + 1

          itHandlesConfigChangesProperly(configChangeTermId, handleDisputes)
        })

        context('when scheduling a config for the current term', () => {
          const configChangeTermId = currentTerm

          it('reverts', async () => {
            await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.TOO_OLD_TERM)
          })
        })

        context('when scheduling a config for the previous term', () => {
          const configChangeTermId = currentTerm - 1

          it('reverts', async () => {
            await assertRevert(protocolHelper.setConfig(configChangeTermId, newConfig, { from }), CONFIG_ERRORS.TOO_OLD_TERM)
          })
        })
      })
    })

    context('when the sender is not the governor', () => {
      const from = someone

      it('reverts', async () => {
        await assertRevert(protocolHelper.setConfig(0, newConfig, { from }), CONTROLLER_ERRORS.SENDER_NOT_GOVERNOR)
      })
    })
  })
})
