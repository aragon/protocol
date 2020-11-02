const { bn, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { VOTING_EVENTS } = require('../helpers/utils/events')
const { OUTCOMES, hashVote } = require('../helpers/utils/crvoting')
const { DISPUTE_MANAGER_ERRORS, VOTING_ERRORS, CONTROLLED_ERRORS } = require('../helpers/utils/errors')

const CRVoting = artifacts.require('CRVoting')
const DisputeManager = artifacts.require('DisputeManagerMockForVoting')

contract('CRVoting', ([_, voter, someone, delegate, governor]) => {
  let controller, voting, disputeManager

  const POSSIBLE_OUTCOMES = 2

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ configGovernor: governor, modulesGovernor: governor })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  beforeEach('create voting module', async () => {
    voting = await CRVoting.new(controller.address)
    await controller.setVoting(voting.address)
  })

  describe('delegate', () => {
    const itSetsTheDelegate = sender => {
      it('allows the delegate', async () => {
        await voting.delegate(voter, delegate, { from: sender })

        assert.isTrue(await voting.isDelegateOf(voter, delegate), 'delegate is not allowed')
      })

      it('emits an event', async () => {
        const receipt = await voting.delegate(voter, delegate, { from: sender })

        assertAmountOfEvents(receipt, VOTING_EVENTS.DELEGATE_SET)
        assertEvent(receipt, VOTING_EVENTS.DELEGATE_SET, { expectedArgs: { voter, delegate } })
      })
    }

    const itUnsetsTheDelegate = sender => {
      it('disallows the delegate', async () => {
        await voting.delegate(voter, ZERO_ADDRESS, { from: sender })

        assert.isFalse(await voting.isDelegateOf(voter, delegate), 'delegate is not allowed')
      })

      it('emits an event', async () => {
        const receipt = await voting.delegate(voter, ZERO_ADDRESS, { from: sender })

        assertAmountOfEvents(receipt, VOTING_EVENTS.DELEGATE_SET)
        assertEvent(receipt, VOTING_EVENTS.DELEGATE_SET, { expectedArgs: { voter, delegate: ZERO_ADDRESS } })
      })
    }

    const itHandlesDelegatesProperly = sender => {
      context('when the delegate was not set', () => {
        context('when the delegate is allowed', () => {
          itSetsTheDelegate(sender)
        })

        context('when the delegate is disallowed', () => {
          itUnsetsTheDelegate(sender)
        })
      })

      context('when the delegate was already set', () => {
        context('when the delegate was allowed', () => {
          beforeEach('set delegate', async () => {
            await voting.delegate(voter, delegate, { from: sender })
          })

          context('when the delegate is allowed', () => {
            itSetsTheDelegate(sender)
          })

          context('when the delegate is disallowed', () => {
            itUnsetsTheDelegate(sender)
          })
        })

        context('when the delegate was not allowed', () => {
          beforeEach('unset delegate', async () => {
            await voting.delegate(voter, ZERO_ADDRESS, { from: sender })
          })

          context('when the delegate is allowed', () => {
            itSetsTheDelegate(sender)
          })

          context('when the delegate is disallowed', () => {
            itUnsetsTheDelegate(sender)
          })
        })
      })
    }

    context('when the sender is the voter', () => {
      const sender = voter

      itHandlesDelegatesProperly(sender)
    })

    context('when the sender is not the voter', () => {
      const sender = someone

      context('when the sender is a whitelisted relayer', () => {
        beforeEach('whitelist relayer', async () => {
          await controller.updateRelayerWhitelist(sender, true, { from: governor })
        })

        itHandlesDelegatesProperly(sender)
      })

      context('when the sender is not a whitelisted relayer', () => {
        beforeEach('disallow relayer', async () => {
          await controller.updateRelayerWhitelist(sender, false, { from: governor })
        })

        it('reverts', async () => {
          await assertRevert(voting.delegate(voter, delegate, { from: sender }), CONTROLLED_ERRORS.SENDER_NOT_ALLOWED)
        })
      })
    })
  })

  describe('commit', () => {
    context('when the given vote ID is valid', () => {
      const voteId = 0

      beforeEach('create voting', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
      })

      const itHandlesCommitsProperly = sender => {
        context('when the voter has not voted before', () => {
          context('when the owner does not revert when checking the weight of the voter', () => {
            context('when the owner tells a weight greater than zero', () => {
              const weight = 10

              beforeEach('mock voter weight', async () => {
                await disputeManager.mockVoterWeight(voter, weight)
              })

              const itHandlesCommittedVotesFor = outcome => {
                const commitment = hashVote(outcome)

                it('does not affect the voter outcome yet', async () => {
                  await voting.commit(voteId, voter, commitment, { from: sender })

                  const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                  assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')
                })

                it('emits an event', async () => {
                  const receipt = await voting.commit(voteId, voter, commitment, { from: sender })

                  assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
                  assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedArgs: { voteId, voter, commitment } })
                })

                it('does not affect the outcomes tally', async () => {
                  const previousTally = await voting.getOutcomeTally(voteId, outcome)

                  await voting.commit(voteId, voter, commitment, { from: sender })

                  const currentTally = await voting.getOutcomeTally(voteId, outcome)
                  assertBn(previousTally, currentTally, 'tallies do not match')
                })

                it('does not affect the winning outcome', async () => {
                  const previousWinningOutcome = await voting.getWinningOutcome(voteId)
                  const previousWinningOutcomeTally = await voting.getOutcomeTally(voteId, previousWinningOutcome)

                  await voting.commit(voteId, voter, commitment, { from: sender })

                  const currentWinningOutcome = await voting.getWinningOutcome(voteId)
                  assertBn(previousWinningOutcome, currentWinningOutcome, 'winning outcomes do not match')

                  const currentWinningOutcomeTally = await voting.getOutcomeTally(voteId, currentWinningOutcome)
                  assertBn(previousWinningOutcomeTally, currentWinningOutcomeTally, 'winning outcome tallies do not match')
                })

                it('does not consider the voter a winner', async () => {
                  await voting.commit(voteId, voter, commitment, { from: sender })

                  const winningOutcome = await voting.getWinningOutcome(voteId)
                  assert.isFalse(await voting.hasVotedInFavorOf(voteId, winningOutcome, voter), 'voter should not be a winner')
                })
              }

              context('when the given commitment is equal to the missing outcome', () => {
                itHandlesCommittedVotesFor(OUTCOMES.MISSING)
              })

              context('when the given commitment is equal to the leaked outcome', () => {
                itHandlesCommittedVotesFor(OUTCOMES.LEAKED)
              })

              context('when the given commitment is equal to the refused outcome', () => {
                itHandlesCommittedVotesFor(OUTCOMES.REFUSED)
              })

              context('when the given commitment is a valid outcome', () => {
                itHandlesCommittedVotesFor(OUTCOMES.LOW)
              })

              context('when the given commitment is an out-of-bounds outcome', () => {
                itHandlesCommittedVotesFor(OUTCOMES.HIGH.add(bn(1)))
              })
            })

            context('when the owner tells a zeroed weight', () => {
              const weight = 0

              beforeEach('mock voter weight', async () => {
                await disputeManager.mockVoterWeight(voter, weight)
              })

              it('reverts', async () => {
                await assertRevert(voting.commit(voteId, voter, '0x', { from: sender }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
              })
            })
          })

          context('when the owner reverts when checking the weight of the voter', () => {
            beforeEach('mock the owner to revert', async () => {
              await disputeManager.mockChecksFailing(true)
            })

            it('reverts', async () => {
              await assertRevert(voting.commit(voteId, voter, '0x', { from: sender }), VOTING_ERRORS.OWNER_MOCK_COMMIT_CHECK_REVERTED)
            })
          })
        })

        context('when the voter has already voted', () => {
          const commitment = hashVote(bn(0))

          beforeEach('mock voter weight and commit', async () => {
            const weight = 10
            await disputeManager.mockVoterWeight(voter, weight)
            await voting.commit(voteId, voter, commitment, { from: sender })
          })

          context('when the new commitment is the same as the previous one', () => {
            it('reverts', async () => {
              await assertRevert(voting.commit(voteId, voter, commitment, { from: sender }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })

          context('when the new commitment is different than the previous one', () => {
            it('reverts', async () => {
              await assertRevert(voting.commit(voteId, voter, hashVote(bn(100)), { from: sender }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })
        })
      }

      context('when the sender is the voter', () => {
        const sender = voter

        itHandlesCommitsProperly(sender)
      })

      context('when the sender is not the voter', () => {
        context('when the sender is a delegate', () => {
          const sender = delegate

          beforeEach('set delegate', async () => {
            await voting.delegate(voter, delegate, { from: voter })
          })

          context('when the sender is still a delegate', () => {
            itHandlesCommitsProperly(sender)
          })

          context('when the sender is not a delegate any more', () => {
            beforeEach('unset delegate', async () => {
              await voting.delegate(voter, ZERO_ADDRESS, { from: voter })
            })

            it('reverts', async () => {
              await assertRevert(voting.commit(voteId, voter, '0x', { from: sender }), VOTING_ERRORS.SENDER_NOT_DELEGATE)
            })
          })
        })

        context('when the sender is not a delegate', () => {
          const sender = someone

          context('when the sender is a whitelisted relayer', () => {
            beforeEach('whitelist relayer', async () => {
              await controller.updateRelayerWhitelist(sender, true, { from: governor })
            })

            itHandlesCommitsProperly(sender)
          })

          context('when the sender is not a whitelisted relayer', () => {
            beforeEach('disallow relayer', async () => {
              await controller.updateRelayerWhitelist(sender, false, { from: governor })
            })

            it('reverts', async () => {
              await assertRevert(voting.commit(voteId, voter, '0x', { from: sender }), VOTING_ERRORS.SENDER_NOT_DELEGATE)
            })
          })
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commit(0, voter, '0x', { from: voter }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })
})
