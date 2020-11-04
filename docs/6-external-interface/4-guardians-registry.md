## 6.4. Guardians Registry

### 6.4.1 Events

The following events are emitted by the `GuardiansRegistry`:

#### 6.4.1.1. Staked

- **Name:** `Staked`
- **Args:**
    - **Guardian:** Address of the guardian to stake the tokens to
    - **Amount:** Amount of tokens to be staked
    - **Total:** Total staked balance on the registry

#### 6.4.1.2. Unstaked

- **Name:** `Unstaked`
- **Args:**
    - **Guardian:** Address of the guardian to unstake the tokens of
    - **Amount:** Amount of tokens to be unstaked
    - **Total:** Total staked balance on the registry

#### 6.4.1.3. Guardian activated

- **Name:** `GuardianActivated`
- **Args:**
    - **Guardian:** Address of the guardian activated
    - **Amount:** Amount of guardian tokens activated
    - **From term ID:** Identification number of the term in which the guardian tokens will be activated

#### 6.4.1.4. Guardian deactivation requested

- **Name:** `GuardianDeactivationRequested`
- **Args:**
    - **Guardian:** Address of the guardian that requested a tokens deactivation
    - **Amount:** Amount of guardian tokens to be deactivated
    - **Available term ID:** Identification number of the term in which the requested tokens will be deactivated

#### 6.4.1.5. Guardian deactivation processed

- **Name:** `GuardianDeactivationProcessed`
- **Args:**
    - **Guardian:** Address of the guardian whose deactivation request was processed
    - **Amount:** Amount of guardian tokens deactivated
    - **Available term ID:** Identification number of the term in which the requested tokens will be deactivated
    - **Processed term ID:** Identification number of the term in which the given deactivation was processed

#### 6.4.1.6. Guardian deactivation updated

- **Name:** `GuardianDeactivationUpdated`
- **Args:**
    - **Guardian:** Address of the guardian whose deactivation request was updated
    - **Amount:** New amount of guardian tokens of the deactivation request
    - **Available term ID:** Identification number of the term in which the requested tokens will be deactivated
    - **Updated term ID:** Identification number of the term in which the given deactivation was updated

#### 6.4.1.7. Guardian activation lock changed

- **Name:** `GuardianActivationLockChanged`
- **Args:**
    - **Guardian:** Address of the guardian whose activation was changed
    - **Lock manager:** Address of the lock manager controlling the lock
    - **Amount:** New activation locked amount of the guardian
    - **Total:** New total activation lock of the guardian

#### 6.4.1.8. Guardian balance locked

- **Name:** `GuardianBalanceLocked`
- **Args:**
    - **Guardian:** Address of the guardian whose active balance was locked
    - **Amount:** New amount locked to the guardian

#### 6.4.1.9. Guardian balance unlocked

- **Name:** `GuardianBalanceUnlocked`
- **Args:**
    - **Guardian:** Address of the guardian whose active balance was unlocked
    - **Amount:** Amount of active locked that was unlocked to the guardian

#### 6.4.1.10. Guardian slashed

- **Name:** `GuardianSlashed`
- **Args:**
    - **Guardian:** Address of the guardian whose active tokens were slashed
    - **Amount:** Amount of guardian tokens slashed from the guardian active tokens
    - **Effective term ID:** Identification number of the term when the guardian active balance will be updated

#### 6.4.1.11. Guardian tokens assigned

- **Name:** `GuardianTokensAssigned`
- **Args:**
    - **Guardian:** Address of the guardian receiving tokens
    - **Amount:** Amount of guardian tokens assigned to the staked balance of the guardian

#### 6.4.1.12. Guardian tokens burned

- **Name:** `GuardianTokensBurned`
- **Args:**
    - **Amount:** Amount of guardian tokens burned to the zero address

#### 6.4.1.13. Guardian tokens collected

- **Name:** `GuardianTokensCollected`
- **Args:**
    - **Guardian:** Address of the guardian whose active tokens were collected
    - **Amount:** Amount of guardian tokens collected from the guardian active tokens
    - **Effective term ID:** Identification number of the term when the guardian active balance will be updated

#### 6.4.1.14. Activator whitelist changed

- **Name:** `ActivatorWhitelistChanged`
- **Args:**
    - **Activator:** Address of the activator whose status was changed
    - **Allowed:** Whether the activator is whitelisted

#### 6.4.1.15. Lock manager whitelist changed

- **Name:** `LockManagerWhitelistChanged`
- **Args:**
    - **Lock manager:** Address of the lock manager whose status was changed
    - **Allowed:** Whether the lock manager is whitelisted

#### 6.4.1.16. Total active balance limit changed

- **Name:** `TotalActiveBalanceLimitChanged`
- **Args:**
    - **Previous limit:** Previous total active balance limit
    - **Current limit:** Current total active balance limit

### 6.4.2. Getters

The following functions are state getters provided by the `GuardiansRegistry`:

#### 6.4.2.1. Token
- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Guardian token:** Address of the guardian token

#### 6.4.2.2. Total staked
- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Total amount of guardian tokens held by the registry contract

#### 6.4.2.3. Total active balance
- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Total amount of active guardian tokens

#### 6.4.2.4. Total active balance at
- **Inputs:**
    - **Term ID:** Identification number of the term querying the total active balance of
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Total amount of active guardian tokens at the given term ID

#### 6.4.2.5. Total staked for
- **Inputs:**
    - **Guardian:** Address of the guardian querying the total amount staked of
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Total amount of tokens of a guardian

#### 6.4.2.6. Balance of
- **Inputs:**
    - **Guardian:** Address of the guardian querying the balance information of
- **Pre-flight checks:** None
- **Outputs:**
    - **Active:** Amount of active tokens of a guardian
    - **Available:** Amount of available tokens of a guardian
    - **Locked:** Amount of active tokens that are locked due to ongoing disputes
    - **Pending deactivation:** Amount of active tokens that were requested for deactivation

#### 6.4.2.7. Balance of at
- **Inputs:**
    - **Guardian:** Address of the guardian querying the balance information of
    - **Term ID:** Identification number of the term querying the balance information of the given guardian
- **Pre-flight checks:** None
- **Outputs:**
    - **Active:** Amount of active tokens of a guardian at the requested term
    - **Available:** Amount of available tokens of a guardian
    - **Locked:** Amount of active tokens that are locked due to ongoing disputes
    - **Pending deactivation:** Amount of active tokens that were requested for deactivation

#### 6.4.2.8. Active balance of at
- **Inputs:**
    - **Guardian:** Address of the guardian querying the active balance of
    - **Term ID:** Identification number of the term querying the total active balance of the given guardian
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Amount of active tokens for guardian in the requested term ID

#### 6.4.2.9. Unlocked active balance of
- **Inputs:**
    - **Guardian:** Address of the guardian querying the unlocked active balance of
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Amount of active tokens of a guardian that are not locked due to ongoing disputes

#### 6.4.2.10. Deactivation request
- **Inputs:**
    - **Guardian:** Address of the guardian querying the deactivation request of
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Amount of tokens to be deactivated
    - **Available term ID:** Term in which the deactivated amount will be available

#### 6.4.2.11. Activation lock
- **Inputs:**
    - **Guardian:** Address of the guardian querying the activation lock of
    - **Lock manager:** Address of the lock manager querying the activation lock of
- **Pre-flight checks:** None
- **Outputs:**
    - **Amount:** Lock activation amount controlled by the given lock manager
    - **Total:** Total activation lock for the given guardian

#### 6.4.2.12. Withdrawals lock term ID
- **Inputs:**
    - **Guardian:** Address of the guardian querying the lock term ID of
- **Pre-flight checks:** None
- **Outputs:**
    - **Term ID:** Term ID in which the guardian's withdrawals will be unlocked (due to final rounds)

#### 6.4.2.13. Is activator whitelisted
- **Inputs:**
    - **Activator:** Address of the activator being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Allowed:** Whether the activator is whitelisted

#### 6.4.2.14. Is lock manager whitelisted
- **Inputs:**
    - **Lock manager:** Address of the lock manager being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Allowed:** Whether the lock manager is whitelisted

#### 6.4.2.15. Total active balance limit
- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Total active balance limit:** Maximum amount of total active balance that can be held in the registry

#### 6.4.2.16. Guardian ID
- **Inputs:**
    - **Guardian:** Address of the guardian querying the ID of
- **Pre-flight checks:** None
- **Outputs:**
    - **Guardian ID:** Identification number associated to a guardian address, zero in case it wasn't registered yet
