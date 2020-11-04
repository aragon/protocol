const { bn, bigExp } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { filterGuardians } = require('../helpers/utils/guardians')
const { VOTING_EVENTS } = require('../helpers/utils/events')
const { buildHelper, ROUND_STATES, DEFAULTS } = require('../helpers/wrappers/protocol')
const { getVoteId, hashVote, outcomeFor, SALT, OUTCOMES } = require('../helpers/utils/crvoting')
const { VOTING_ERRORS, DISPUTE_MANAGER_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

contract('DisputeManager', ([_, drafter, guardian100, guardian500, guardian1000, guardian1500, guardian2000, guardian2500, guardian3000, guardian3500, guardian4000]) => {
  let protocolHelper, voting

  const guardians = [
    { address: guardian100,  initialActiveBalance: bigExp(100,  18) },
    { address: guardian3000, initialActiveBalance: bigExp(3000, 18) },
    { address: guardian500,  initialActiveBalance: bigExp(500,  18) },
    { address: guardian1000, initialActiveBalance: bigExp(1000, 18) },
    { address: guardian2000, initialActiveBalance: bigExp(2000, 18) },
    { address: guardian4000, initialActiveBalance: bigExp(4000, 18) },
    { address: guardian1500, initialActiveBalance: bigExp(1500, 18) },
    { address: guardian3500, initialActiveBalance: bigExp(3500, 18) },
    { address: guardian2500, initialActiveBalance: bigExp(2500, 18) }
  ]

  before('create base contracts and activate guardians', async () => {
    protocolHelper = buildHelper()
    await protocolHelper.deploy({ modulesGovernor: _ })
    voting = protocolHelper.voting
    await protocolHelper.activate(guardians)
  })

  describe('voting', () => {
    let disputeId, voteId, voters, nonVoters

    beforeEach('activate guardians and create dispute', async () => {
      disputeId = await protocolHelper.dispute()
    })

    const itIsAtState = (roundId, state) => {
      it(`round is at state ${state}`, async () => {
        const { roundState } = await protocolHelper.getRound(disputeId, roundId)
        assertBn(roundState, state, 'round state does not match')
      })
    }

    const itFailsToCommitVotes = (commited = true) => {
      it('fails to commit votes', async () => {
        const voterAddresses = voters.map(v => v.address.toLowerCase())
        for (const { address } of guardians) {
          const expectedErrorMessage = (commited && voterAddresses.includes(address.toLowerCase()))
            ? VOTING_ERRORS.VOTE_ALREADY_COMMITTED
            : DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE

          await assertRevert(voting.commit(voteId, address, hashVote(OUTCOMES.LOW), { from: address }), expectedErrorMessage)
        }
      })
    }

    const itFailsToRevealVotes = (commited = true, revealed = true) => {
      it('fails to reveal votes', async () => {
        const voterAddresses = voters.map(v => v.address.toLowerCase())
        for (const { outcome, address } of voters) {
          const expectedErrorMessage = (commited && voterAddresses.includes(address.toLowerCase()))
            ? (revealed ? VOTING_ERRORS.VOTE_ALREADY_REVEALED : DISPUTE_MANAGER_ERRORS.INVALID_ADJUDICATION_STATE)
            : VOTING_ERRORS.INVALID_COMMITMENT_SALT

          await assertRevert(voting.reveal(voteId, address, outcome, SALT), expectedErrorMessage)
        }
      })
    }

    context('for regular rounds', () => {
      const roundId = 0
      let draftedGuardians, nonDraftedGuardians

      beforeEach('draft round', async () => {
        draftedGuardians = await protocolHelper.draft({ disputeId, drafter })
        nonDraftedGuardians = filterGuardians(guardians, draftedGuardians)
      })

      beforeEach('define a group of voters', async () => {
        voteId = getVoteId(disputeId, roundId)
        // pick the first 3 drafted guardians to vote
        voters = draftedGuardians.slice(0, 3)
        voters.forEach((voter, i) => voter.outcome = outcomeFor(i))
        nonVoters = filterGuardians(draftedGuardians, voters)
      })

      context('during commit period', () => {
        const outcome = OUTCOMES.LOW
        const vote = hashVote(outcome)

        itIsAtState(roundId, ROUND_STATES.COMMITTING)
        itFailsToRevealVotes(false, false)

        context('when the sender was drafted', () => {
          context('when the voting module is disabled', () => {
            beforeEach('disable voting module', async () => {
              await protocolHelper.protocol.disableModule(voting.address)
            })

            it('reverts', async () => {
              for (const { address } of draftedGuardians) {
                await assertRevert(voting.commit(voteId, address, vote, { from: address }), CONTROLLED_ERRORS.SENDER_NOT_ACTIVE_VOTING)
              }
            })
          })

          context('when the voting module is enabled', () => {
            beforeEach('enable voting module', async () => {
              await protocolHelper.protocol.enableModule(voting.address)
            })

            it('allows to commit a vote', async () => {
              for (const { address } of draftedGuardians) {
                const receipt = await voting.commit(voteId, address, vote, { from: address })
                assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
              }
            })
          })
        })

        context('when the sender was not drafted', () => {
          it('reverts', async () => {
            for (const { address } of nonDraftedGuardians) {
              await assertRevert(voting.commit(voteId, address, vote, { from: address }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
            }
          })
        })
      })

      context('during reveal period', () => {
        beforeEach('commit votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
        })

        itIsAtState(roundId, ROUND_STATES.REVEALING)
        itFailsToCommitVotes()

        context('when the sender was drafted', () => {
          context('when the sender voted', () => {
            let receipts, expectedTally

            beforeEach('reveal votes', async () => {
              receipts = []
              expectedTally = { [OUTCOMES.LOW]: 0, [OUTCOMES.HIGH]: 0 }

              for (const { address, weight, outcome } of voters) {
                expectedTally[outcome] += weight.toNumber()
                receipts.push(await voting.reveal(voteId, address, outcome, SALT))
              }
            })

            it('allows voters to reveal their vote', async () => {
              for (let i = 0; i < voters.length; i++) {
                const { address, outcome } = voters[i]
                assertEvent(receipts[i], VOTING_EVENTS.VOTE_REVEALED, { expectedArgs: { voteId, voter: address, outcome } })
              }
            })

            it('computes tallies properly', async () => {
              const lowOutcomeTally = await voting.getOutcomeTally(voteId, OUTCOMES.LOW)
              assertBn(lowOutcomeTally, expectedTally[OUTCOMES.LOW], 'low outcome tally does not match')

              const highOutcomeTally = await voting.getOutcomeTally(voteId, OUTCOMES.HIGH)
              assertBn(highOutcomeTally, expectedTally[OUTCOMES.HIGH], 'high outcome tally does not match')

              const winningOutcome = await voting.getWinningOutcome(voteId)
              const expectedWinningOutcome = highOutcomeTally > lowOutcomeTally ? OUTCOMES.HIGH : OUTCOMES.LOW
              assertBn(winningOutcome, expectedWinningOutcome, 'winning outcome does not match')
            })
          })

          context('when the sender did not vote', () => {
            it('reverts', async () => {
              for (const { address } of nonVoters) {
                await assertRevert(voting.reveal(voteId, address, OUTCOMES.LOW, SALT), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
              }
            })
          })
        })
      })

      context('during appeal period', () => {
        beforeEach('commit and reveal votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
        })

        itIsAtState(roundId, ROUND_STATES.APPEALING)
        itFailsToCommitVotes()
        itFailsToRevealVotes()
      })

      context('during the appeal confirmation period', () => {
        beforeEach('commit and reveal votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
        })

        context('when the round was not appealed', () => {
          beforeEach('pass appeal period', async () => {
            await protocolHelper.passTerms(protocolHelper.appealTerms)
          })

          itIsAtState(roundId, ROUND_STATES.ENDED)
          itFailsToCommitVotes()
          itFailsToRevealVotes()
        })

        context('when the round was appealed', () => {
          beforeEach('appeal', async () => {
            await protocolHelper.appeal({ disputeId, roundId })
          })

          itIsAtState(roundId, ROUND_STATES.CONFIRMING_APPEAL)
          itFailsToCommitVotes()
          itFailsToRevealVotes()
        })
      })

      context('after the appeal confirmation period', () => {
        beforeEach('commit and reveal votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
        })

        context('when the round was not appealed', () => {
          beforeEach('pass appeal and confirmation periods', async () => {
            await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
          })

          itIsAtState(roundId, ROUND_STATES.ENDED)
          itFailsToCommitVotes()
          itFailsToRevealVotes()
        })

        context('when the round was appealed', () => {
          beforeEach('appeal', async () => {
            await protocolHelper.appeal({ disputeId, roundId })
          })

          context('when the appeal was not confirmed', () => {
            beforeEach('pass appeal confirmation period', async () => {
              await protocolHelper.passTerms(protocolHelper.appealConfirmTerms)
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToCommitVotes()
            itFailsToRevealVotes()
          })

          context('when the appeal was confirmed', () => {
            beforeEach('confirm appeal', async () => {
              await protocolHelper.confirmAppeal({ disputeId, roundId })
            })

            itIsAtState(roundId, ROUND_STATES.ENDED)
            itFailsToCommitVotes()
            itFailsToRevealVotes()
          })
        })
      })
    })

    context('for a final round', () => {
      const roundId = DEFAULTS.maxRegularAppealRounds.toNumber(), poorGuardian = guardian100

      beforeEach('simulate guardian without enough balance to vote on a final round', async () => {
        const expectedActiveBalance = bigExp(1, 18)
        const { active: previousActiveBalance } = await protocolHelper.guardiansRegistry.detailedBalanceOf(poorGuardian)

        if (previousActiveBalance.gt(expectedActiveBalance)) {
          await protocolHelper.guardiansRegistry.collect(poorGuardian, previousActiveBalance.sub(expectedActiveBalance))
          await protocolHelper.passTerms(bn(1))
        }

        const { active: currentActiveBalance } = await protocolHelper.guardiansRegistry.detailedBalanceOf(poorGuardian)
        assertBn(currentActiveBalance, expectedActiveBalance, 'poor guardian active balance does not match')
      })

      beforeEach('move to final round', async () => {
        await protocolHelper.moveToFinalRound({ disputeId })
      })

      beforeEach('define a group of voters', async () => {
        voteId = getVoteId(disputeId, roundId)
        voters = [
          { address: guardian1000, outcome: OUTCOMES.LOW },
          { address: guardian4000, outcome: OUTCOMES.LOW },
          { address: guardian2000, outcome: OUTCOMES.HIGH },
          { address: guardian1500, outcome: OUTCOMES.REFUSED }
        ]
        nonVoters = filterGuardians(guardians, voters)
      })

      context('during commit period', () => {
        itIsAtState(roundId, ROUND_STATES.COMMITTING)
        itFailsToRevealVotes(false, false)

        context('when the sender has enough active balance', () => {
          it('allows to commit a vote', async () => {
            for (const { address, outcome } of voters) {
              const receipt = await voting.commit(voteId, address, hashVote(outcome), { from: address })
              assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
            }
          })
        })

        context('when the sender does not have enough active balance', () => {
          it('reverts', async () => {
            await assertRevert(voting.commit(voteId, poorGuardian, hashVote(OUTCOMES.LOW), { from: poorGuardian }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
          })
        })
      })

      context('during reveal period', () => {
        beforeEach('commit votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
        })

        itIsAtState(roundId, ROUND_STATES.REVEALING)
        itFailsToCommitVotes()

        context('when the sender voted', () => {
          let receipts, expectedTally

          beforeEach('reveal votes', async () => {
            receipts = []
            expectedTally = { [OUTCOMES.LOW]: 0, [OUTCOMES.HIGH]: 0 }

            for (const { address, outcome } of voters) {
              const { weight } = await protocolHelper.getRoundGuardian(disputeId, roundId, address)
              expectedTally[outcome] += weight.toNumber()
              receipts.push(await voting.reveal(voteId, address, outcome, SALT))
            }
          })

          it('allows voters to reveal their vote', async () => {
            for (let i = 0; i < voters.length; i++) {
              const { address, outcome } = voters[i]
              assertEvent(receipts[i], VOTING_EVENTS.VOTE_REVEALED, { expectedArgs: { voteId, voter: address, outcome } })
            }
          })

          it('computes tallies properly', async () => {
            const lowOutcomeTally = await voting.getOutcomeTally(voteId, OUTCOMES.LOW)
            assertBn(lowOutcomeTally, expectedTally[OUTCOMES.LOW], 'low outcome tally does not match')

            const highOutcomeTally = await voting.getOutcomeTally(voteId, OUTCOMES.HIGH)
            assertBn(highOutcomeTally, expectedTally[OUTCOMES.HIGH], 'high outcome tally does not match')

            const winningOutcome = await voting.getWinningOutcome(voteId)
            const expectedWinningOutcome = highOutcomeTally > lowOutcomeTally ? OUTCOMES.HIGH : OUTCOMES.LOW
            assertBn(winningOutcome, expectedWinningOutcome, 'winning outcome does not match')
          })
        })

        context('when the sender did not vote', () => {
          it('reverts', async () => {
            for (const { address } of nonVoters) {
              await assertRevert(voting.reveal(voteId, address, OUTCOMES.LOW, SALT), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
            }
          })
        })
      })

      context('during appeal period', () => {
        beforeEach('commit and reveal votes', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
        })

        itIsAtState(roundId, ROUND_STATES.ENDED)
        itFailsToCommitVotes()
        itFailsToRevealVotes()
      })

      context('during the appeal confirmation period', () => {
        beforeEach('commit and reveal votes, and pass appeal period', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
          await protocolHelper.passTerms(protocolHelper.appealTerms)
        })

        itIsAtState(roundId, ROUND_STATES.ENDED)
        itFailsToCommitVotes()
        itFailsToRevealVotes()
      })

      context('after the appeal confirmation period', () => {
        beforeEach('commit and reveal votes, and pass appeal and confirmation periods', async () => {
          await protocolHelper.commit({ disputeId, roundId, voters })
          await protocolHelper.reveal({ disputeId, roundId, voters })
          await protocolHelper.passTerms(protocolHelper.appealTerms.add(protocolHelper.appealConfirmTerms))
        })

        itIsAtState(roundId, ROUND_STATES.ENDED)
        itFailsToCommitVotes()
        itFailsToRevealVotes()
      })
    })
  })
})
