## 4.3. Dispute Manager

The `DisputeManager` module is in charge of handling all the disputes-related behavior. This is where disputes are created and appealed.
It is also in charge of computing the final ruling for each dispute, and to settle the rewards and penalties of all the parties involved in the dispute.

### 4.3.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Controller:** Address of the `Controller` contract that centralizes all the modules being used
    - **Max guardians per draft batch:** Max number of guardians to be drafted in each batch
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the controller address is a contract
    - Ensure that the max number of guardians to be drafted per batch is greater than zero
- **State transitions:**
    - Save the controller address
    - Save the max number of guardians to be drafted per batch

### 4.3.2. Create dispute

- **Actor:** Controller
- **Inputs:**
    - **Subject:** Arbitrable instance creating the dispute
    - **Possible rulings:** Number of possible results for a dispute
    - **Metadata:** Optional metadata that can be used to provide additional information on the dispute to be created
- **Authentication:** Only the controller is allowed to call this function
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure that the number of possible rulings is within some reasonable bounds (hardcoded as constants)
- **State transitions:**
    - Update current Court term if needed
    - Create a new dispute object
    - Create an adjudication round object setting the draft term at the end of the evidence submission period
    - Calculate dispute fees based on the current Court configuration
    - Set the number of guardians to be drafted based on the Court configuration at the term when dispute was created
    - Pull the required dispute fee amount from the sender to be deposited in the `Treasury` module, revert if the ERC20-transfer wasn't successful

### 4.3.3. Close evidence period

- **Actor:** Controller
- **Inputs:**
    - **Dispute ID:** Dispute identification number
- **Authentication:** Only the controller is allowed to call this function
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute object with that ID exists
    - Ensure that the current term is at least after the term when the dispute was created
    - Ensure that the dispute evidence period is still open
- **State transitions:**
    - Update the dispute draft term ID of the first adjudication round to the current term

### 4.3.4. Draft

- **Actor:** External entity incentivized by the draft fee they will earn by performing this execution. Alternatively, an altruistic entity to make sure the dispute is drafted
- **Inputs:**
    - **Dispute ID:** Dispute identification number
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, revert (cannot heartbeat and draft in the same block)
    - Ensure a dispute object with that ID exists
    - Ensure that the last round of the dispute hasn't finished drafting yet
    - Ensure that the draft term for the last round has been reached
    - Ensure that the randomness seed for the current term is either available (current block number within a certain range) or was saved by another draft
- **State transitions:**
    - Search up to the maximum batch size of guardians in the `GuardianRegistry` using the current term's randomness seed for entropy, which will lock a certain amount of ANT tokens to each of the drafted guardians based on the penalty permille of the Court. The maximum number of guardians to be drafted will depend on the maximum number allowed per batch set in the Court and the corresponding number of guardians for the dispute. Additionally, the `GuardiansRegistry` could return fewer guardians than the requested number. To have a better understanding of how the sortition works go to **section X**.
    - Update the dispute object with the resultant guardians from the draft. If all the guardians of the dispute have been drafted, transition the dispute to the adjudication phase.
    - Reward the caller with draft fees for each guardian drafted, using the configuration at the term when the dispute was created.

### 4.3.5. Create appeal

- **Actor:** External entity not in favor of the ruling decided by the drafted guardians during the adjudication phase
- **Inputs:**
    - **Dispute ID:** Dispute identification number
    - **Round ID:** Adjudication round identification number
    - **Ruling:** Ruling number proposed by the appealer
- **Authentication:** Open. Implicitly, only accounts that have open an ERC20 allowance with an amount of at least the required appeal collateral to the `DisputeManager` module can call this function
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute object with that ID exists
    - Ensure an adjudication round object with that ID exists for the given dispute
    - Ensure that the adjudication round can be appealed
    - Ensure that the given ruling is different from the one already decided by the drafted guardians
    - Ensure that the given ruling is either refused or one of the possible rulings supported by the `DisputeManager` module
- **State transitions:**
    - Update current Court term if needed
    - Create a new appeal object tracking the address and proposed ruling of the appealer
    - Pull the required appeal collateral from the sender to be deposited in the `Treasury` module, calculating it based on the Court configuration when the dispute was created, revert if the ERC20-transfer wasn't successful

### 4.3.6. Confirm appeal

- **Actor:** External entity not in favor of the ruling proposed by a previously submitted appeal
- **Inputs:**
    - **Dispute ID:** Dispute identification number
    - **Round ID:** Adjudication round identification number
    - **Ruling:** Ruling number proposed by the entity confirming the appeal
- **Authentication:** Open. Implicitly, only accounts that have open an ERC20 allowance with an amount of at least the required appeal confirmation collateral to the `DisputeManager` module can call this function
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute object with that ID exists
    - Ensure an adjudication round object with that ID exists for the given dispute
    - Ensure that the adjudication round was appeal and can still be confirmed
    - Ensure that the given ruling is different from the one proposed by the appealer
    - Ensure that the given ruling is either refused or one of the possible rulings supported by the `DisputeManager` module
- **State transitions:**
    - Update current Court term if needed
    - Create a new adjudication round object and set the draft term right after the end of the final adjudication phase of the current dispute round
    - If the final appeal round hasn't been reached yet:
        - Calculate the number of guardians to be drafted for the new round applying the appeal step factor to the number of guardians drafted for the previous round
        - Transition the dispute to the draft phase
    - If the final appeal round has been reached:
        - Calculate the number of guardians of the final round as the number of times the minimum ANT active balance is held in the `GuardiansRegistry` module
        - Transition the dispute to the adjudication phase
    - Update the current round appeal object tracking the address and proposed ruling of the account confirming the appeal
    - Calculate new round fees based on the Court configuration at the term when the dispute was created
    - Pull the required appeal confirmation collateral, which includes the new round fees, from the sender to be deposited in the `Treasury` module, revert if the ERC20-transfer wasn't successful

### 4.3.7. Compute ruling

- **Actor:** External entity incentivized to execute the final ruling decided for a dispute. Alternatively, an altruistic entity to make sure the dispute is ruled.
- **Inputs:**
    - **Dispute ID:** Dispute identification number
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure a dispute object with that ID exists
    - Ensure that the dispute's last round adjudication phase has ended
- **State transitions:**
    - Update the final ruling of the dispute object based on the ruling decided by the guardians during the current round or the ruling proposed by the appealer of the previous round in case there was one but wasn't confirmed.

### 4.3.8. Settle penalties

- **Actor:** External entity incentivized to slash the losing guardians. Alternatively, an altruistic entity to make sure the dispute is settled.
- **Inputs:**
    - **Dispute ID:** Dispute identification number
    - **Round ID:** Adjudication round identification number
    - **Max number of guardians to settle:** Maximum number of guardians to be settled during the call. It can be set to zero to denote all the guardians that were drafted for the adjudication round.
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute object with that ID exists
    - Ensure an adjudication round object with that ID exists for the given dispute
    - Ensure that the given round is the first adjudication round of the dispute or that the previous round penalties were already settled
    - Ensure that the adjudication round penalties haven't been settled yet
- **State transitions:**
    - Update current Court term if needed
    - In case the final ruling of the dispute has not been computed yet, update the final ruling of the dispute object based on the ruling decided by the guardians during the current round or the ruling proposed by the appealer of the previous round in case there was one but wasn't confirmed.
    - Update the adjudication round object with the number of guardians that voted in favor of the final ruling
    - If the adjudication round being settled is not a final round:
        - Ask the `GuardiansRegistry` module to slash or unlock the locked ANT tokens from the drafted guardians based on whether they voted in favor of the dispute's final ruling or not.
        - Update the adjudication round object marking all the guardians whose penalties were settled
        - Deposit the corresponding settle fees based on the number of guardians settled to the caller in the `Treasury` module
    - If the adjudication round being settled is a final round:
        - Update the adjudication round object to mark that all guardians' penalties were settled
    - In case all the guardians' penalties have been settled, and there was not even one guardian voting in favor of the final ruling:
        - Ask the `GuardiansRegistry` module to burn all the ANT tokens that were collected during the adjudication round
        - Return the adjudication round fees to the dispute creator or the appeal parties depending on whether the adjudication round was triggered by the `Arbitrable` instance who created the dispute or due to a previous round that was appealed respectively.

### 4.3.9. Settle reward

- **Actor:** External entity incentivized to reward the winning guardians. Alternatively, an altruistic entity to make sure the dispute is settled.
- **Inputs:**
    - **Dispute ID:** Dispute identification number
    - **Round ID:** Adjudication round identification number
    - **Guardian address:** Address of the guardian to settle their rewards
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure a dispute object with that ID exists
    - Ensure an adjudication round object with that ID exists for the given dispute
    - Ensure penalties have been settled
    - Ensure that the guardian has not been rewarded
    - Ensure that the guardian was drafted for the adjudication round
    - Ensure that the guardian has voted in favor of the final ruling of the dispute
- **State transitions:**
    - Update the adjudication round object marking that the guardian was rewarded
    - Assign to the guardian the corresponding portion of ANT tokens slashed from the losing guardians
    - Deposit the corresponding portion of guardian fees into the `Treasury` module to the guardian

### 4.3.10. Settle appeal deposit

- **Actor:** External entity incentivized to settle the appeal parties. Alternatively, an altruistic entity to make sure the dispute is settled.
- **Inputs:**
    - **Dispute ID:** Dispute identification number
    - **Round ID:** Adjudication round identification number
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure a dispute object with that ID exists
    - Ensure an adjudication round object with that ID exists for the given dispute
    - Ensure penalties have been settled
    - Ensure that the adjudication round was appealed
    - Ensure that the adjudication round's appeal has not been settled yet
- **State transitions:**
    - Mark the adjudication round's appeal as settled
    - Deposit the corresponding portions of the appeal deposits into the `Treasury` module to each party

### 4.3.11. Ensure can commit

- **Actor:** Any entity incentivized to check if it is possible to commit votes for a certain dispute adjudication round
- **Inputs:**
    - **Vote ID:** Vote identification number
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute and adjudication round exists with that vote ID
    - Ensure votes can still be committed for the adjudication round
- **State transitions:**
    - Update current Court term if needed


### 4.3.12. Ensure voter can commit

- **Actor:** Any entity incentivized to check if it is possible to commit votes for a certain dispute adjudication round
- **Inputs:**
    - **Vote ID:** Vote identification number
- **Authentication:** Only active `Voting` modules
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute and adjudication round exists with that vote ID
    - Ensure votes can still be committed for the adjudication round
    - Ensure that the voter was drafted to vote for the adjudication round
- **State transitions:**
    - Update current Court term if needed
    - Update the guardian's weight for the adjudication round if its a final round

### 4.3.13. Ensure voter can reveal

- **Actor:** Any entity incentivized to check if it is possible to reveal votes for a certain dispute adjudication round
- **Inputs:**
    - **Vote ID:** Vote identification number
- **Authentication:**
- **Pre-flight checks:**
    - Ensure that the Court term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure a dispute and adjudication round exists with that vote ID
    - Ensure votes can still be revealed for the adjudication round
- **State transitions:**
    - Update current Court term if needed

### 4.3.14. Set max guardians per draft batch

- **Actor:** External entity in charge of maintaining the court configuration (config governor)
- **Inputs:**
    - **New max guardians per draft batch:** New max number of guardians to be drafted in each batch
- **Authentication:** Only config governor
- **Pre-flight checks:**
    - Ensure that the max number of guardians to be drafted per batch is greater than zero
- **State transitions:**
    - Save the max number of guardians to be drafted per batch

### 4.3.15. Recover funds

- **Actor:** External entity in charge of maintaining the court funds (funds governor)
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token or ETH to be recovered from the `DisputeManager` module
    - **Recipient:** Address that will receive the funds of the `DisputeManager` module
- **Authentication:** Only funds governor
- **Pre-flight checks:**
    - Ensure that the balance of the `DisputeManager` module is greater than zero
- **State transitions:**
    - Transfer the whole balance of the `DisputeManager` module to the recipient address, revert if the ERC20-transfer wasn't successful
