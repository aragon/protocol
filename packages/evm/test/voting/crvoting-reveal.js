const { bn } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/court')
const { VOTING_ERRORS } = require('../helpers/utils/errors')
const { VOTING_EVENTS } = require('../helpers/utils/events')
const { SALT, OUTCOMES, hashVote } = require('../helpers/utils/crvoting')

const CRVoting = artifacts.require('CRVoting')
const Court = artifacts.require('DisputeManagerMockForVoting')

contract('CRVoting reveal', ([_, voter, someone]) => {
  let controller, voting, disputeManager

  const POSSIBLE_OUTCOMES = 2

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy()

    voting = await CRVoting.new(controller.address)
    await controller.setVoting(voting.address)

    disputeManager = await Court.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  describe('reveal', () => {
    context('when the given vote ID is valid', () => {
      const voteId = 0

      beforeEach('create voting', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
      })

      context('when the given voter has not voted before', () => {
        it('reverts', async () => {
          await assertRevert(voting.reveal(voteId, voter, OUTCOMES.LOW, SALT), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
        })
      })

      context('when the given voter has already voted', () => {
        const itHandlesValidRevealedVotesFor = committedOutcome => {
          const commitment = hashVote(committedOutcome)

          beforeEach('commit a vote', async () => {
            await disputeManager.mockVoterWeight(voter, 10)
            await voting.commit(voteId, voter, commitment, { from: voter })
          })

          context('when the owner does not revert when checking the weight of the voter', () => {
            context('when the owner tells a weight greater than zero', () => {
              const weight = 10

              beforeEach('mock voter weight', async () => {
                await disputeManager.mockVoterWeight(voter, weight)
              })

              context('when the given outcome matches the one committed', () => {
                const outcome = committedOutcome

                context('when the given salt matches the one used', () => {
                  const salt = SALT

                  const itHandlesRevealsCorrectly = from => {
                    it('reveals the given vote', async () => {
                      await voting.reveal(voteId, voter, outcome, salt, { from })

                      const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                      assertBn(voterOutcome, outcome, 'voter outcome does not match')
                    })

                    it('emits an event', async () => {
                      const receipt = await voting.reveal(voteId, voter, outcome, salt, { from })

                      assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_REVEALED)
                      assertEvent(receipt, VOTING_EVENTS.VOTE_REVEALED, { expectedArgs: { voteId, voter, outcome } })
                    })

                    it('updates the outcomes tally', async () => {
                      const previousTally = await voting.getOutcomeTally(voteId, outcome)

                      await voting.reveal(voteId, voter, outcome, salt, { from })

                      const currentTally = await voting.getOutcomeTally(voteId, outcome)
                      assertBn(previousTally.add(bn(weight)), currentTally, 'tallies do not match')
                    })

                    it('computes the new winning outcome', async () => {
                      await voting.reveal(voteId, voter, outcome, salt, { from })

                      assertBn((await voting.getWinningOutcome(voteId)), outcome, 'winning outcomes does not match')
                    })

                    it('considers the voter as a winner', async () => {
                      await voting.reveal(voteId, voter, outcome, salt, { from })

                      const winningOutcome = await voting.getWinningOutcome(voteId)
                      assert.isTrue(await voting.hasVotedInFavorOf(voteId, winningOutcome, voter), 'voter should be a winner')
                    })
                  }

                  context('when voter is revealing their own vote', () => {
                    const from = voter

                    itHandlesRevealsCorrectly(from)
                  })

                  context('when another one is revealing the vote', () => {
                    const from = someone

                    itHandlesRevealsCorrectly(from)
                  })
                })

                context('when the given salt does not match the one used', () => {
                  const salt = '0x'

                  it('reverts', async () => {
                    await assertRevert(voting.reveal(voteId, voter, outcome, salt), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
                  })
                })
              })

              context('when the given outcome does not match the one committed', () => {
                const outcome = committedOutcome + 1

                context('when the given salt matches the one used', () => {
                  const salt = SALT

                  it('reverts', async () => {
                    await assertRevert(voting.reveal(voteId, voter, outcome, salt), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
                  })
                })

                context('when the given salt does not match the one used', () => {
                  const salt = '0x'

                  it('reverts', async () => {
                    await assertRevert(voting.reveal(voteId, voter, outcome, salt), VOTING_ERRORS.INVALID_COMMITMENT_SALT)
                  })
                })
              })
            })
          })

          context('when the owner reverts when checking the weight of the voter', () => {
            beforeEach('mock the owner to revert', async () => {
              await disputeManager.mockChecksFailing(true)
            })

            it('reverts', async () => {
              await assertRevert(voting.reveal(voteId, voter, committedOutcome, SALT), VOTING_ERRORS.OWNER_MOCK_REVEAL_CHECK_REVERTED)
            })
          })
        }

        const itHandlesInvalidOutcomeRevealedVotesFor = committedOutcome => {
          const commitment = hashVote(committedOutcome)

          beforeEach('commit a vote', async () => {
            await disputeManager.mockVoterWeight(voter, 10)
            await voting.commit(voteId, voter, commitment, { from: voter })
          })

          it('reverts', async () => {
            await assertRevert(voting.reveal(voteId, voter, committedOutcome, SALT), VOTING_ERRORS.INVALID_OUTCOME)
          })
        }

        context('when the given voter committed a valid outcome', () => {
          itHandlesValidRevealedVotesFor(OUTCOMES.LOW)
        })

        context('when the given voter committed a refused outcome', () => {
          itHandlesValidRevealedVotesFor(OUTCOMES.REFUSED)
        })

        context('when the given voter committed a missing outcome', () => {
          itHandlesInvalidOutcomeRevealedVotesFor(OUTCOMES.MISSING)
        })

        context('when the given voter committed a leaked outcome', () => {
          itHandlesInvalidOutcomeRevealedVotesFor(OUTCOMES.LEAKED)
        })

        context('when the given voter committed an out-of-bounds outcome', () => {
          itHandlesInvalidOutcomeRevealedVotesFor(OUTCOMES.HIGH.add(bn(1)))
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.reveal(0, voter, 0, '0x'), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })
})
