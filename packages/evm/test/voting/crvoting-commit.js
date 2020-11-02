const { bn } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { VOTING_EVENTS } = require('../helpers/utils/events')
const { encodeAuthorization } = require('../helpers/utils/modules')
const { OUTCOMES, hashVote } = require('../helpers/utils/crvoting')
const { DISPUTE_MANAGER_ERRORS, VOTING_ERRORS } = require('../helpers/utils/errors')

const CRVoting = artifacts.require('CRVoting')
const DisputeManager = artifacts.require('DisputeManagerMockForVoting')

contract('CRVoting', ([_, someone, representative, governor]) => {
  let controller, voting, disputeManager

  const wallet = web3.eth.accounts.create('voting')
  const externalAccount = wallet.address
  const externalAccountPK = wallet.privateKey

  const POSSIBLE_OUTCOMES = 2

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy({ modulesGovernor: governor })
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  beforeEach('create voting module', async () => {
    voting = await CRVoting.new(controller.address)
    await controller.setVoting(voting.address)
  })

  describe('setRepresentatives', () => {
    const itAllowsTheRepresentative = () => {
      it('allows the representative', async () => {
        await voting.setRepresentatives([representative], [true], { from: someone })

        assert.isTrue(await voting.isRepresentativeOf(someone, representative), 'representative is not allowed')
      })

      it('emits an event', async () => {
        const receipt = await voting.setRepresentatives([representative], [true], { from: someone })

        assertAmountOfEvents(receipt, VOTING_EVENTS.REPRESENTATIVE_CHANGED)
        assertEvent(receipt, VOTING_EVENTS.REPRESENTATIVE_CHANGED, { expectedArgs: { voter: someone, representative, allowed: true } })
      })
    }

    const itDisallowsTheRepresentative = () => {
      it('disallows the representative', async () => {
        await voting.setRepresentatives([representative], [false], { from: someone })

        assert.isFalse(await voting.isRepresentativeOf(someone, representative), 'representative is not allowed')
      })

      it('emits an event', async () => {
        const receipt = await voting.setRepresentatives([representative], [false], { from: someone })

        assertAmountOfEvents(receipt, VOTING_EVENTS.REPRESENTATIVE_CHANGED)
        assertEvent(receipt, VOTING_EVENTS.REPRESENTATIVE_CHANGED, { expectedArgs: { voter: someone, representative, allowed: false } })
      })
    }

    context('when the representative was not set', () => {
      context('when the representative is allowed', () => {
        itAllowsTheRepresentative()
      })

      context('when the representative is disallowed', () => {
        itDisallowsTheRepresentative()
      })
    })

    context('when the representative was already set', () => {
      context('when the representative was allowed', () => {
        beforeEach('set representative', async () => {
          await voting.setRepresentatives([representative], [true])
        })

        context('when the representative is allowed', () => {
          itAllowsTheRepresentative()
        })

        context('when the representative is disallowed', () => {
          itDisallowsTheRepresentative()
        })
      })

      context('when the representative was not allowed', () => {
        beforeEach('set representative', async () => {
          await voting.setRepresentatives([representative], [false])
        })

        context('when the representative is allowed', () => {
          itAllowsTheRepresentative()
        })

        context('when the representative is disallowed', () => {
          itDisallowsTheRepresentative()
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

      const commit = async (voter, commitment, sender, authorized = false) => {
        let calldata = voting.contract.methods.commit(voteId, voter, commitment).encodeABI()
        if (authorized) calldata = await encodeAuthorization(voting, voter, externalAccountPK, calldata, sender)
        return voting.sendTransaction({ from: sender, data: calldata })
      }

      const itHandlesCommitsProperly = (voter, sender, authorized = false) => {
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
                  await commit(voter, commitment, sender, authorized)

                  const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                  assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')
                })

                it('emits an event', async () => {
                  const receipt = await commit(voter, commitment, sender, authorized)

                  assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
                  assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedArgs: { voteId, voter, commitment, sender } })
                })

                it('does not affect the outcomes tally', async () => {
                  const previousTally = await voting.getOutcomeTally(voteId, outcome)

                  await commit(voter, commitment, sender, authorized)

                  const currentTally = await voting.getOutcomeTally(voteId, outcome)
                  assertBn(previousTally, currentTally, 'tallies do not match')
                })

                it('does not affect the winning outcome', async () => {
                  const previousWinningOutcome = await voting.getWinningOutcome(voteId)
                  const previousWinningOutcomeTally = await voting.getOutcomeTally(voteId, previousWinningOutcome)

                  await commit(voter, commitment, sender, authorized)

                  const currentWinningOutcome = await voting.getWinningOutcome(voteId)
                  assertBn(previousWinningOutcome, currentWinningOutcome, 'winning outcomes do not match')

                  const currentWinningOutcomeTally = await voting.getOutcomeTally(voteId, currentWinningOutcome)
                  assertBn(previousWinningOutcomeTally, currentWinningOutcomeTally, 'winning outcome tallies do not match')
                })

                it('does not consider the voter a winner', async () => {
                  await commit(voter, commitment, sender, authorized)

                  const winningOutcome = await voting.getWinningOutcome(voteId)
                  assert.isFalse(await voting.hasVotedInFavorOf(voteId, winningOutcome, voter), 'voter should not be a winner')
                })
              }

              context('when the given commitment is equal to the missing outcome', async () => {
                itHandlesCommittedVotesFor(OUTCOMES.MISSING)
              })

              context('when the given commitment is equal to the leaked outcome', async () => {
                itHandlesCommittedVotesFor(OUTCOMES.LEAKED)
              })

              context('when the given commitment is equal to the refused outcome', async () => {
                itHandlesCommittedVotesFor(OUTCOMES.REFUSED)
              })

              context('when the given commitment is a valid outcome', async () => {
                itHandlesCommittedVotesFor(OUTCOMES.LOW)
              })

              context('when the given commitment is an out-of-bounds outcome', async () => {
                itHandlesCommittedVotesFor(OUTCOMES.HIGH.add(bn(1)))
              })
            })

            context('when the owner tells a zeroed weight', () => {
              const weight = 0

              beforeEach('mock voter weight', async () => {
                await disputeManager.mockVoterWeight(voter, weight)
              })

              it('reverts', async () => {
                await assertRevert(commit(voter, '0x', sender, authorized), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
              })
            })
          })

          context('when the owner reverts when checking the weight of the voter', () => {
            beforeEach('mock the owner to revert', async () => {
              await disputeManager.mockChecksFailing(true)
            })

            it('reverts', async () => {
              await assertRevert(commit(voter, '0x', sender, authorized), VOTING_ERRORS.OWNER_MOCK_COMMIT_CHECK_REVERTED)
            })
          })
        })

        context('when the voter has already voted', () => {
          const commitment = hashVote(bn(0))

          beforeEach('mock voter weight and commit', async () => {
            const weight = 10
            await disputeManager.mockVoterWeight(voter, weight)
            await commit(voter, commitment, sender, authorized)
          })

          context('when the new commitment is the same as the previous one', () => {
            it('reverts', async () => {
              await assertRevert(commit(voter, commitment, sender, authorized), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })

          context('when the new commitment is different than the previous one', () => {
            it('reverts', async () => {
              await assertRevert(commit(voter, hashVote(bn(100)), sender, authorized), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })
        })
      }

      context('when the sender is the voter', () => {
        const voter = someone
        const sender = someone

        itHandlesCommitsProperly(voter, sender)
      })

      context('when the sender is a representative', () => {
        const voter = someone
        const sender = representative

        beforeEach('set representative', async () => {
          await voting.setRepresentatives([representative], [true], { from: voter })
        })

        context('when the sender is still a representative', () => {
          itHandlesCommitsProperly(voter, sender)
        })

        context('when the sender is not a representative any more', () => {
          beforeEach('set representative', async () => {
            await voting.setRepresentatives([representative], [false], { from: voter })
          })

          it('reverts', async () => {
            await assertRevert(commit(voter, '0x', sender), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
          })
        })
      })

      context('when the sender is not a representative', () => {
        const voter = externalAccount
        const sender = someone

        context('when the sender is authorized', () => {
          const authorized = true

          itHandlesCommitsProperly(voter, sender, authorized)
        })

        context('when the sender is not authorized', () => {
          const authorized = false

          it('reverts', async () => {
            await assertRevert(commit(voter, '0x', sender, authorized), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
          })
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commit(0, someone, '0x', { from: someone }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })
})
