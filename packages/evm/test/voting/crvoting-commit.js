const { ecsign } = require('ethereumjs-util')
const { bn } = require('@aragon/contract-helpers-test')
const { assertRevert, assertBn, assertAmountOfEvents, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const { buildHelper } = require('../helpers/wrappers/protocol')
const { VOTING_EVENTS } = require('../helpers/utils/events')
const { OUTCOMES, hashVote, createRepresetativeAuthorization } = require('../helpers/utils/crvoting')
const { DISPUTE_MANAGER_ERRORS, VOTING_ERRORS } = require('../helpers/utils/errors')

const CRVoting = artifacts.require('CRVoting')
const DisputeManager = artifacts.require('DisputeManagerMockForVoting')

contract('CRVoting', ([_, voter, anotherVoter, representative, anotherRepresentative]) => {
  let controller, voting, disputeManager

  const POSSIBLE_OUTCOMES = 2

  beforeEach('create base contracts', async () => {
    controller = await buildHelper().deploy()
    disputeManager = await DisputeManager.new(controller.address)
    await controller.setDisputeManager(disputeManager.address)
  })

  beforeEach('create voting module', async () => {
    voting = await CRVoting.new(controller.address)
    await controller.setVoting(voting.address)
  })

  async function authorizeRepresentative(voteId, voter, voterPK, representative) {
    const digest = await createRepresetativeAuthorization(voting, voteId, voter, representative)
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(voterPK.slice(2), 'hex'))
    assert.isTrue(await voting.isRepresentativeAllowed(voteId, voter, representative, v, r, s), 'representative is not allowed')
    return { v, r, s }
  }

  describe('commit', () => {
    context('when the given vote ID is valid', () => {
      const voteId = 0

      beforeEach('create voting', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
      })

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
                await voting.commit(voteId, commitment, { from: voter })

                const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')
              })

              it('emits an event', async () => {
                const receipt = await voting.commit(voteId, commitment, { from: voter })

                assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
                assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedArgs: { voteId, voter, commitment, sender: voter } })
              })

              it('does not affect the outcomes tally', async () => {
                const previousTally = await voting.getOutcomeTally(voteId, outcome)

                await voting.commit(voteId, commitment, { from: voter })

                const currentTally = await voting.getOutcomeTally(voteId, outcome)
                assertBn(previousTally, currentTally, 'tallies do not match')
              })

              it('does not affect the winning outcome', async () => {
                const previousWinningOutcome = await voting.getWinningOutcome(voteId)
                const previousWinningOutcomeTally = await voting.getOutcomeTally(voteId, previousWinningOutcome)

                await voting.commit(voteId, commitment, { from: voter })

                const currentWinningOutcome = await voting.getWinningOutcome(voteId)
                assertBn(previousWinningOutcome, currentWinningOutcome, 'winning outcomes do not match')

                const currentWinningOutcomeTally = await voting.getOutcomeTally(voteId, currentWinningOutcome)
                assertBn(previousWinningOutcomeTally, currentWinningOutcomeTally, 'winning outcome tallies do not match')
              })

              it('does not consider the voter a winner', async () => {
                await voting.commit(voteId, commitment, { from: voter })

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
              await assertRevert(voting.commit(voteId, '0x', { from: voter }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
            })
          })
        })

        context('when the owner reverts when checking the weight of the voter', () => {
          beforeEach('mock the owner to revert', async () => {
            await disputeManager.mockChecksFailing(true)
          })

          it('reverts', async () => {
            await assertRevert(voting.commit(voteId, '0x', { from: voter }), VOTING_ERRORS.OWNER_MOCK_COMMIT_CHECK_REVERTED)
          })
        })
      })

      context('when the voter has already voted', () => {
        const commitment = hashVote(bn(0))

        beforeEach('mock voter weight and commit', async () => {
          const weight = 10
          await disputeManager.mockVoterWeight(voter, weight)
          await voting.commit(voteId, commitment, { from: voter })
        })

        context('when the new commitment is the same as the previous one', () => {
          it('reverts', async () => {
            await assertRevert(voting.commit(voteId, commitment, { from: voter }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
          })
        })

        context('when the new commitment is different than the previous one', () => {
          it('reverts', async () => {
            await assertRevert(voting.commit(voteId, hashVote(bn(100)), { from: voter }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
          })
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commit(0, '0x', { from: voter }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })

  describe('commitFor', () => {
    const from = representative

    context('when the given vote ID is valid', () => {
      const voteId = 0

      beforeEach('create voting', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
      })

      context('when the sender was allowed as a representative by the voter', () => {
        beforeEach('allow representative', async () => {
          await voting.setRepresentatives([representative], [true], { from: voter })
          assert.isTrue(await voting.isRepresentativeOf(voter, representative), 'representative is not allowed')
        })

        context('when the voter has not voted before', () => {
          context('when the owner tells a weight greater than zero', () => {
            const weight = 10

            beforeEach('mock voter weight', async () => {
              await disputeManager.mockVoterWeight(voter, weight)
            })

            const itHandlesCommittedVotesFor = outcome => {
              const commitment = hashVote(outcome)

              it('does not affect the voter outcome yet', async () => {
                await voting.commitFor(voteId, voter, commitment, { from })

                const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')
              })

              it('emits an event', async () => {
                const receipt = await voting.commitFor(voteId, voter, commitment, { from })

                assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
                assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedArgs: { voteId, voter, commitment, sender: representative } })
              })

              it('does not affect the outcomes tally', async () => {
                const previousTally = await voting.getOutcomeTally(voteId, outcome)

                await voting.commitFor(voteId, voter, commitment, { from })

                const currentTally = await voting.getOutcomeTally(voteId, outcome)
                assertBn(previousTally, currentTally, 'tallies do not match')
              })

              it('does not affect the winning outcome', async () => {
                const previousWinningOutcome = await voting.getWinningOutcome(voteId)
                const previousWinningOutcomeTally = await voting.getOutcomeTally(voteId, previousWinningOutcome)

                await voting.commitFor(voteId, voter, commitment, { from })

                const currentWinningOutcome = await voting.getWinningOutcome(voteId)
                assertBn(previousWinningOutcome, currentWinningOutcome, 'winning outcomes do not match')

                const currentWinningOutcomeTally = await voting.getOutcomeTally(voteId, currentWinningOutcome)
                assertBn(previousWinningOutcomeTally, currentWinningOutcomeTally, 'winning outcome tallies do not match')
              })

              it('does not consider the voter a winner', async () => {
                await voting.commitFor(voteId, voter, commitment, { from })

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
              await assertRevert(voting.commitFor(voteId, voter, hashVote(bn(0)), { from }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
            })
          })
        })

        context('when the voter has already voted', () => {
          const commitment = hashVote(bn(0))

          beforeEach('mock voter weight and commit', async () => {
            const weight = 10
            await disputeManager.mockVoterWeight(voter, weight)
            await voting.commit(voteId, commitment, { from: voter })
          })

          context('when the new commitment is the same as the previous one', () => {
            it('reverts', async () => {
              await assertRevert(voting.commitFor(voteId, voter, commitment, { from }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })

          context('when the new commitment is different than the previous one', () => {
            it('reverts', async () => {
              await assertRevert(voting.commitFor(voteId, voter, hashVote(bn(100)), { from }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })
        })
      })

      context('when the sender was not allowed as a representative by the voter', () => {
        it('reverts', async () => {
          await assertRevert(voting.commitFor(voteId, voter, hashVote(bn(0)), { from }), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commitFor(0, voter, '0x', { from }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })

  describe('commitForMany', () => {
    const voteId = 0
    const from = representative
    const voteIds = [voteId, voteId]
    const principals = [voter, anotherVoter]

    context('when the given vote ID is valid', () => {
      beforeEach('create voting and mock weight', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
        await disputeManager.mockVoterWeight(voter, 10)
        await disputeManager.mockVoterWeight(anotherVoter, 10)
      })

      beforeEach('allow representative', async () => {
        await voting.setRepresentatives([representative], [true], { from: voter })
        assert.isTrue(await voting.isRepresentativeOf(voter, representative), 'representative is not allowed')

        await voting.setRepresentatives([representative], [true], { from: anotherVoter })
        assert.isTrue(await voting.isRepresentativeOf(anotherVoter, representative), 'representative is not allowed')
      })

      context('when the given input is valid', () => {
        const commitments = [hashVote(OUTCOMES.HIGH), hashVote(OUTCOMES.LOW)]

        it('commits all the sent votes', async () => {
          const receipt = await voting.commitForMany(voteIds, principals, commitments, { from })

          const voterOutcome = await voting.getVoterOutcome(voteId, voter)
          assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')

          const anotherVoterOutcome = await voting.getVoterOutcome(voteId, anotherVoter)
          assertBn(anotherVoterOutcome, OUTCOMES.MISSING, 'another voter outcome should be missing')

          assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedAmount: 2 })
          assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { index: 0, expectedArgs: { voteId, voter, commitment: hashVote(OUTCOMES.HIGH), sender: representative } })
          assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { index: 1, expectedArgs: { voteId, voter: anotherVoter, commitment: hashVote(OUTCOMES.LOW), sender: representative } })
        })
      })

      context('when the given input is not valid', () => {
        it('reverts', async () => {
          await assertRevert(voting.commitForMany([voteId], principals, ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForMany(voteIds, [voter], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForMany(voteIds, principals, ['0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commitForMany(voteIds, principals, ['0x', '0x'], { from }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })

  describe('commitForWithSig', () => {
    let voter, voterPK
    const from = representative

    before('create wallet', async () => {
      const wallet = web3.eth.accounts.create('erc3009')
      voter = wallet.address
      voterPK = wallet.privateKey
    })

    context('when the given vote ID is valid', () => {
      const voteId = 0

      beforeEach('create voting', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
      })

      context('when the sender was allowed as a representative by the voter', () => {
        context('when the voter has not voted before', () => {
          context('when the owner tells a weight greater than zero', () => {
            const weight = 10

            beforeEach('mock voter weight', async () => {
              await disputeManager.mockVoterWeight(voter, weight)
            })

            const itHandlesCommittedVotesFor = outcome => {
              const commitment = hashVote(outcome)

              it('does not affect the voter outcome yet', async () => {
                const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
                await voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })

                const voterOutcome = await voting.getVoterOutcome(voteId, voter)
                assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')
              })

              it('emits an event', async () => {
                const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
                const receipt = await voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })

                assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED)
                assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedArgs: { voteId, voter, commitment, sender: representative } })
              })

              it('does not affect the outcomes tally', async () => {
                const previousTally = await voting.getOutcomeTally(voteId, outcome)

                const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
                await voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })

                const currentTally = await voting.getOutcomeTally(voteId, outcome)
                assertBn(previousTally, currentTally, 'tallies do not match')
              })

              it('does not affect the winning outcome', async () => {
                const previousWinningOutcome = await voting.getWinningOutcome(voteId)
                const previousWinningOutcomeTally = await voting.getOutcomeTally(voteId, previousWinningOutcome)

                const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
                await voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })

                const currentWinningOutcome = await voting.getWinningOutcome(voteId)
                assertBn(previousWinningOutcome, currentWinningOutcome, 'winning outcomes do not match')

                const currentWinningOutcomeTally = await voting.getOutcomeTally(voteId, currentWinningOutcome)
                assertBn(previousWinningOutcomeTally, currentWinningOutcomeTally, 'winning outcome tallies do not match')
              })

              it('does not consider the voter a winner', async () => {
                const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
                await voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })

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
              const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
              await assertRevert(voting.commitForWithSig(voteId, voter, hashVote(bn(0)), v, r, s, { from }), DISPUTE_MANAGER_ERRORS.VOTER_WEIGHT_ZERO)
            })
          })
        })

        context('when the voter has already voted', () => {
          const commitment = hashVote(bn(0))

          beforeEach('mock voter weight and commit', async () => {
            const weight = 10
            await disputeManager.mockVoterWeight(voter, weight)
            const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
            voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from })
          })

          context('when the new commitment is the same as the previous one', () => {
            it('reverts', async () => {
              const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
              await assertRevert(voting.commitForWithSig(voteId, voter, commitment, v, r, s, { from }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })

          context('when the new commitment is different than the previous one', () => {
            it('reverts', async () => {
              const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, representative)
              await assertRevert(voting.commitForWithSig(voteId, voter, hashVote(bn(100)), v, r, s, { from }), VOTING_ERRORS.VOTE_ALREADY_COMMITTED)
            })
          })
        })
      })

      context('when the sender was not allowed as a representative by the voter', () => {
        it('reverts', async () => {
          await assertRevert(voting.commitForWithSig(voteId, voter, hashVote(bn(0)), 0, '0x', '0x', { from }), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
        })
      })

      context('when the sender allowed the representative for another vote', () => {
        it('reverts', async () => {
          const { v, r, s } = await authorizeRepresentative(voteId + 1, voter, voterPK, representative)
          assert.isFalse(await voting.isRepresentativeAllowed(voteId, voter, representative, v, r, s), 'representative is allowed')
          await assertRevert(voting.commitForWithSig(voteId, voter, hashVote(bn(0)), v, r, s, { from }), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
        })
      })

      context('when the sender allowed someone else', () => {
        it('reverts', async () => {
          const { v, r, s } = await authorizeRepresentative(voteId, voter, voterPK, anotherRepresentative)
          await assertRevert(voting.commitForWithSig(voteId, voter, hashVote(bn(0)), v, r, s, { from }), VOTING_ERRORS.SENDER_NOT_REPRESENTATIVE)
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commitForWithSig(0, voter, '0x', 0, '0x', '0x', { from }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })

  describe('commitForManyWithSig', () => {
    let voterPK, anotherVoterPK, principals
    const voteId = 0
    const from = representative
    const voteIds = [voteId, voteId]

    before('create wallets', async () => {
      const wallet = web3.eth.accounts.create('erc3009')
      const anotherWallet = web3.eth.accounts.create('erc3009')

      voter = wallet.address
      anotherVoter = anotherWallet.address

      voterPK = wallet.privateKey
      anotherVoterPK = anotherWallet.privateKey

      principals = [voter, anotherVoter]
    })

    context('when the given vote ID is valid', () => {
      beforeEach('create voting and mock weight', async () => {
        await disputeManager.create(voteId, POSSIBLE_OUTCOMES)
        await disputeManager.mockVoterWeight(voter, 10)
        await disputeManager.mockVoterWeight(anotherVoter, 10)
      })

      context('when the given input is valid', () => {
        const commitments = [hashVote(OUTCOMES.HIGH), hashVote(OUTCOMES.LOW)]

        it('commits all the sent votes', async () => {
          const voterAuth = await authorizeRepresentative(voteId, voter, voterPK, representative)
          const anotherVoterAuth = await authorizeRepresentative(voteId, anotherVoter, anotherVoterPK, representative)

          const v = [voterAuth.v, anotherVoterAuth.v]
          const r = [voterAuth.r, anotherVoterAuth.r]
          const s = [voterAuth.s, anotherVoterAuth.s]

          const receipt = await voting.commitForManyWithSig(voteIds, principals, commitments, v, r, s, { from })

          const voterOutcome = await voting.getVoterOutcome(voteId, voter)
          assertBn(voterOutcome, OUTCOMES.MISSING, 'voter outcome should be missing')

          const anotherVoterOutcome = await voting.getVoterOutcome(voteId, anotherVoter)
          assertBn(anotherVoterOutcome, OUTCOMES.MISSING, 'another voter outcome should be missing')

          assertAmountOfEvents(receipt, VOTING_EVENTS.VOTE_COMMITTED, { expectedAmount: 2 })
          assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { index: 0, expectedArgs: { voteId, voter, commitment: hashVote(OUTCOMES.HIGH), sender: representative } })
          assertEvent(receipt, VOTING_EVENTS.VOTE_COMMITTED, { index: 1, expectedArgs: { voteId, voter: anotherVoter, commitment: hashVote(OUTCOMES.LOW), sender: representative } })
        })
      })

      context('when the given input is not valid', () => {
        it('reverts', async () => {
          await assertRevert(voting.commitForManyWithSig([voteId], principals, ['0x', '0x'], [0, 0], ['0x', '0x'], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForManyWithSig(voteIds, [voter], ['0x', '0x'], [0, 0], ['0x', '0x'], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForManyWithSig(voteIds, principals, ['0x'], [0, 0], ['0x', '0x'], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForManyWithSig(voteIds, principals, ['0x', '0x'], [0], ['0x', '0x'], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForManyWithSig(voteIds, principals, ['0x', '0x'], [0, 0], ['0x'], ['0x', '0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
          await assertRevert(voting.commitForManyWithSig(voteIds, principals, ['0x', '0x'], [0, 0], ['0x', '0x'], ['0x'], { from }), VOTING_ERRORS.INVALID_INPUTS_LENGTH)
        })
      })
    })

    context('when the given vote ID is not valid', () => {
      it('reverts', async () => {
        await assertRevert(voting.commitForManyWithSig(voteIds, principals, ['0x', '0x'], [0, 0], ['0x', '0x'], ['0x', '0x'], { from }), VOTING_ERRORS.VOTE_DOES_NOT_EXIST)
      })
    })
  })
})
