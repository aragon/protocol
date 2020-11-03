## 4.4. Guardians Registry

The `GuardiansRegistry` module is in charge of handling the guardians activity and mainly the different states of their staked balances.
This module is in the one handling all the staking/unstaking logic for the guardians, all the ANT staked into the Protocol is held by the registry.

### 4.4.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Controller:** Address of the `Controller` contract that centralizes all the modules being used
    - **Guardian token:** Address of the ERC20 token to be used as guardian token for the registry
    - **Total active balance limit:** Maximum amount of total active balance that can be held in the registry
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the controller address is a contract
    - Ensure that the guardian token address is a contract
    - Ensure that the total active balance limit is greater than zero
- **State transitions:**
    - Save the controller address
    - Save the guardian token address
    - Save the total active balance limit

### 4.4.2. Stake

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian staking the tokens for
    - **Amount:** Amount of tokens to be staked
- **Authentication:** Open. Implicitly, only senders that have open an ERC20 allowance with the requested amount of tokens to stake.
- **Pre-flight checks:**
    - Ensure that the given amount is greater than zero
- **State transitions:**
    - Update the available balance of the guardian
    - Pull the corresponding amount of guardian tokens from the sender to the `GuardiansRegistry` module, revert if the ERC20-transfer wasn't successful

### 4.4.3. Unstake

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian unstaking the tokens from
    - **Amount:** Amount of tokens to be unstaked
- **Authentication:** The guardian or a whitelisted relayer. Only for guardians that have some available balance in the registry.
- **Pre-flight checks:**
    - Ensure that the requested amount is greater than zero
    - Ensure that there is enough available balance for the requested amount
- **State transitions:**
    - Update the available balance of the guardian
    - Process previous deactivation requests if there is any, increase the guardian's available balance
    - Transfer the requested amount of guardian tokens from the `GuardiansRegistry` module to the guardian, revert if the ERC20-transfer wasn't successful

### 4.4.4. Activate

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian activating the tokens for
    - **Amount:** Amount of guardian tokens to be activated for the next term
    - **Authorization:** Optional authorization granted by the guardian in case of a third party sender
- **Authentication:** The guardian or a whitelisted relayer. Only for guardians with some available balance.
- **Pre-flight checks:**
    - Ensure that the Protocol term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure that the requested amount is greater than zero
    - Ensure that the guardian's available balance is enough for the requested amount
    - Ensure that the new active balance is greater than the minimum active balance for the Protocol
    - Ensure that the total active balance held in the registry does not reach the limit
- **State transitions:**
    - Update current Protocol term if needed
    - Process previous deactivation requests if there is any, increase the guardian's available balance
    - Update the guardian's active balance for the next term
    - Decrease the guardian's available balance

### 4.4.5. Deactivate

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian deactivating the tokens for
    - **Amount:** Amount of guardian tokens to be deactivated for the next term
    - **Authorization:** Optional authorization granted by the guardian in case of a third party sender
- **Authentication:** The guardian or a whitelisted relayer. Only for guardians with some activated balance.
- **Pre-flight checks:**
    - Ensure that the Protocol term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure that the unlocked active balance of the guardians is enough for the requested amount
    - Ensure that the remaining active balance is either zero or greater than the minimum active balance for the Protocol
- **State transitions:**
    - Update current Protocol term if needed
    - Process previous deactivation requests if there is any, increase the guardian's available balance
    - Create a new deactivation request object for the next term

### 4.4.6. Stake and activate

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian to stake and activate an amount of tokens to
    - **Amount:** Amount of tokens to be staked
- **Authentication:** The guardian or a whitelisted relayer. Only if the sender has open an ERC20 allowance with the requested amount of tokens to stake can call this function
- **Pre-flight checks:**
    - Validate that the sender is the guardian himself, a whitelisted relayer, or a whitelisted activator
    - Ensure that the given amount is greater than zero
- **State transitions:**
    - Update the available balance of the guardian
    - Activate the staked amount if requested. This includes processing pending deactivation requests.
    - Pull the corresponding amount of guardian tokens from the sender to the `GuardiansRegistry` module, revert if the ERC20-transfer wasn't successful

### 4.4.7. Lock activation

- **Actor:** Guardian or an external entity incentivized in a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian lock the activation for
    - **Lock manager**: Address of the lock manager that will control the lock
    - **Amount**: Amount of active tokens to be locked
- **Authentication:** Only the guardian, an external account allowed by signature, or a whitelisted lock manager.
- **Pre-flight checks:**
    - Validate that the sender is the guardian himself, a whitelisted relayer, or a whitelisted lock manager
    - Ensure that the given lock manager is whitelisted by the `GuardiansRegistry`
- **State transitions:**
    - Increase the total amount locked for the guardian
    - Increase the amount locked for the guardian by the given lock manager

### 4.4.8. Unlock activation

- **Actor:** External entity incentivized to unlock the activation of a guardian of the Protocol
- **Inputs:**
    - **Guardian:** Address of the guardian unlocking the active balance of
    - **Lock manager:** Address of the lock manager controlling the lock
    - **Amount:** Amount of active tokens to be unlocked
    - **Request deactivation:** Whether the unlocked amount must be requested for deactivation immediately
- **Authentication:** Only the guardian, an external account allowed by signature, or a whitelisted lock manager. Only if the lock manager allowes to unlock the requested amount.
- **Pre-flight checks:**
    - Ensure that the requested amount can be unlocked
    - Ensure that the given amount is greater than zero
    - Ensure that the given lock manager has locked some amount
- **State transitions:**
    - Decrease the total amount locked for the guardian
    - Decrease the amount locked for the guardian by the given lock manager
    - If the sender is the guardian or a whitelisted relayer, schedule a deactivation if requested

### 4.4.9. Process deactivation request

- **Actor:** External entity incentivized to update guardians available balances
- **Inputs:**
    - **Guardian:** Address of the guardian to process the deactivation request of
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the Protocol term is up-to-date. Otherwise, perform a heartbeat before continuing the execution.
    - Ensure there is an existing deactivation request for the guardian
    - Ensure that the existing deactivation request can be processed at the current term
- **State transitions:**
    - Increase the available balance of the guardian
    - Reset the deactivation request of the guardian

### 4.4.10. Assign tokens

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Guardian:** Address of the guardian to add an amount of tokens to
    - **Amount:** Amount of tokens to be added to the available balance of a guardian
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:** None
- **State transitions:**
    - Increase the guardian's available balance

### 4.4.11. Burn tokens

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Amount:** Amount of tokens to be burned
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:** None
- **State transitions:**
    - Increase the burn address's available balance

### 4.4.12. Draft

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Draft params:** Object containing:
        - **Term randomness:** Randomness to compute the seed for the draft
        - **Dispute ID:** Identification number of the dispute to draft guardians for
        - **Term ID:** Identification number of the current term when the draft is being computed
        - **Selected guardians:** Number of guardians already selected for the draft
        - **Batch requested guardians:** Number of guardians to be selected in the given batch of the draft
        - **Draft requested guardians:** Total number of guardians requested to be drafted
        - **Draft locking permyriad:** ‱ of the minimum active balance to be locked for the draft (1/10,000)
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:**
    - Ensure that the requested number of guardians to be drafted is greater than zero
    - Ensure each drafted guardian has enough active balance to be locked for the draft
    - Ensure that a limit number of drafting iterations will be computed
- **State transitions:**
    - Update the locked active balance of each drafted guardian
    - Decrease previous deactivation requests if there is any and needed to draft the guardian

### 4.4.13. Slash or unlock

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Term ID:** Current term identification number
    - **Guardians:** List of guardian addresses to be slashed
    - **Locked amounts:** List of amounts locked for each corresponding guardian that will be either slashed or returned
    - **Rewarded guardians:** List of booleans to tell whether a guardian's active balance has to be slashed or not
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:**
    - Ensure that both lists lengths match
    - Ensure that each guardian has enough locked balance to be unlocked
- **State transitions:**
    - Decrease the unlocked balance of each guardian based on their corresponding given amounts
    - In case of a guardian being slashed, decrease their active balance for the next term

### 4.4.14. Collect tokens

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Guardian:** Address of the guardian to collect the tokens from
    - **Amount:** Amount of tokens to be collected from the given guardian and for the requested term id
    - **Term ID:** Current term identification number
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:**
    - Ensure the guardian has enough active balance based on the requested amount
- **State transitions:**
    - Decrease the active balance of the guardian for the next term
    - Decrease previous deactivation requests if there is any and its necessary to collect the requested amount of tokens from a guardian

### 4.4.15. Lock withdrawals

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Guardian:** Address of the guardian to locked the withdrawals of
    - **Term ID:** Term identification number until which the guardian's withdrawals will be locked
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:** None
- **State transitions:**
    - Update the guardian's state with the term ID until which their withdrawals will be locked

### 4.4.16. Set total active balance limit

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New total active balance limit:** New limit of total active balance of guardian tokens
- **Authentication:** Only config governor
- **Pre-flight checks:**
    - Ensure that the total active balance limit is greater than zero
- **State transitions:**
    - Update the total active balance limit

### 4.4.17. Change activator whitelist

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Activator:** Address of the activator to be changed
    - **Allowed:** Whether the activator is allowed
- **Authentication:** Only config governor
- **Pre-flight checks:** None
- **State transitions:**
    - Update the activator status

### 4.4.18. Change lock manager whitelist

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Lock manager:** Address of the lock manager to be changed
    - **Allowed:** Whether the lock manager is allowed
- **Authentication:** Only config governor
- **Pre-flight checks:** None
- **State transitions:**
    - Update the lock manager status

### 4.4.19. Recover funds

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token or ETH to be recovered from the `GuardiansRegistry` module
    - **Recipient:** Address that will receive the funds of the `GuardiansRegistry` module
- **Authentication:** Only funds governor
- **Pre-flight checks:**
    - Ensure that the balance of the `GuardiansRegistry` module is greater than zero
- **State transitions:**
    - Transfer the whole balance of the `GuardiansRegistry` module to the recipient address, revert if the ERC20-transfer wasn't successful
