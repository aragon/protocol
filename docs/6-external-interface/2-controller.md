## 6.2. Controller

### 6.2.1 Events

The following events are emitted by the `Controller`:

#### 6.2.1.1. Config changed

- **Name:** `NewConfig`
- **Args:**
    - **From term ID:** Identification number of the Protocol term when the config change will happen
    - **Protocol config ID:** Identification number of the Protocol config to be changed

#### 6.2.1.2. Start time delayed

- **Name:** `StartTimeDelayed`
- **Args:**
    - **Previous first term start time:** Previous timestamp in seconds when the Protocol will start
    - **Current first-term start time:** New timestamp in seconds when the Protocol will start

#### 6.2.1.3. Heartbeat

- **Name:** `Heartbeat`
- **Args:**
    - **Previous term ID:** Identification number of the Protocol term before the transition
    - **Current term ID:** Identification number of the Protocol term after the transition

#### 6.2.1.4. Automatic withdrawals changed

- **Name:** `AutomaticWithdrawalsAllowedChanged`
- **Args:**
    - **Holder:** Address of the token holder whose automatic withdrawals config was changed
    - **Allowed:** Whether automatic withdrawals are allowed or not for the given holder

#### 6.2.1.5. Module set

- **Name:** `ModuleSet`
- **Args:**
    - **Module ID:** ID of the module being set
    - **Address:** Address of the module being set

#### 6.2.1.6. Module enabled

- **Name:** `ModuleEnabled`
- **Args:**
    - **Module ID:** ID of the enabled module
    - **Address:** Address of the enabled module

#### 6.2.1.7. Module disabled

- **Name:** `ModuleDisabled`
- **Args:**
    - **Module ID:** ID of the disabled module
    - **Address:** Address of the disabled module

#### 6.2.1.8. Custom function set

- **Name:** `CustomFunctionSet`
- **Args:**
    - **Signature:** Signature of the function being set
    - **Target:** Address set as the target for the custom function  

#### 6.2.1.9. Funds governor changed

- **Name:** `FundsGovernorChanged`
- **Args:**
    - **Previous governor:** Address of the previous funds governor
    - **Current governor:** Address of the current funds governor

#### 6.2.1.10. Config governor changed

- **Name:** `ConfigGovernorChanged`
- **Args:**
    - **Previous governor:** Address of the previous config governor
    - **Current governor:** Address of the current config governor

#### 6.2.1.11. Modules governor changed

- **Name:** `ModulesGovernorChanged`
- **Args:**
    - **Previous governor:** Address of the previous modules governor
    - **Current governor:** Address of the current modules governor

#### 6.2.1.12. Granted

- **Name:** `FundsGovernorChanged`
- **Args:**
    - **Role:** ID of the role that was granted 
    - **Who:** Address of the entity that was granted

#### 6.2.1.13. Revoked

- **Name:** `Revoked`
- **Args:**
    - **Role:** ID of the role that was revoked 
    - **Who:** Address of the entity that was revoked

#### 6.2.1.14. Frozen

- **Name:** `Frozen`
- **Args:**
    - **Role:** ID of the role that was frozen

### 6.2.2. Getters

The following functions are state getters provided by the `Controller`:

#### 6.2.2.3. Config

- **Inputs:**
    - **Term ID:** Identification number of the term querying the Protocol config of
- **Pre-flight checks:** None
- **Outputs:**
    - **Fee token:** Address of the token used to pay for fees
    - **Fees:** Array Array containing fee information:
        - **Guardian fee:** Amount of fee tokens that is paid per guardian per dispute
        - **Draft fee:** Amount of fee tokens per guardian to cover the drafting cost
        - **Settle fee:** Amount of fee tokens per guardian to cover round settlement cost
    - **Round state durations:** Array containing the durations in terms of the different phases of a dispute:
        - **Evidence terms:** Max submitting evidence period duration in Protocol terms
        - **Commit terms:** Commit period duration in Protocol terms
        - **Reveal terms:** Reveal period duration in Protocol terms
        - **Appeal terms:** Appeal period duration in Protocol terms
        - **Appeal confirmation terms:** Appeal confirmation period duration in Protocol terms
    - **Permyriads:** Array containing permyriads information:
        - **Penalty pct:** Permyriad of min active tokens balance to be locked for each drafted guardian (‱ - 1/10,000)
        - **Final round reduction:** Permyriad of fee reduction for the last appeal round (‱ - 1/10,000)
    - **Round params:** Array containing params for rounds:
        - **First round guardians number:** Number of guardians to be drafted for the first round of disputes
        - **Appeal step factor:** Increasing factor for the number of guardians of each round of a dispute
        - **Max regular appeal rounds:** Number of regular appeal rounds before the final round is triggered
        - **Final round lock terms:** Number of terms that a coherent guardian in a final round is disallowed to withdraw (to prevent 51% attacks)
    - **Appeal collateral params:** Array containing params for appeal collateral:
        - **Appeal collateral factor:** Multiple of dispute fees (guardians, draft, and settlements) required to appeal a preliminary ruling
        - **Appeal confirm collateral factor:** Multiple of dispute fees (guardians, draft, and settlements) required to confirm appeal

#### 6.2.2.4. Drafts config

- **Inputs:**
    - **Term ID:** Identification number of the term querying the Protocol drafts config of
- **Pre-flight checks:** None
- **Outputs:**
    - **Fee token:** ERC20 token to be used for the fees of the Protocol
    - **Draft fee:** Amount of fee tokens per guardian to cover the drafting cost
    - **Penalty pct:** Permyriad of min active tokens balance to be locked for each drafted guardian (‱ - 1/10,000)

#### 6.2.2.5. Minimum ANT active balance

- **Inputs:**
    - **Term ID:** Identification number of the term querying the Protocol min active balance of
- **Pre-flight checks:** None
- **Outputs:**
    - **Min active balance:** Minimum amount of guardian tokens guardians have to activate to participate in the Protocol

#### 6.2.2.6. Config change term ID

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Config change term ID:** Term identification number of the next scheduled config change

#### 6.2.2.7. Term duration

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Term duration:** Duration in seconds of the Protocol term

#### 6.2.2.8. Last ensured term ID

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Last ensured term ID:** Identification number of the last ensured term

#### 6.2.2.9. Current term ID

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Current term ID:** Identification number of the current term

#### 6.2.2.10. Needed transitions

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Needed transitions:** Number of terms the Protocol should transition to be up-to-date

#### 6.2.2.11. Term

- **Inputs:**
    - **Term ID:** Identification number of the term being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Start time:** Term start time
    - **Randomness BN:** Block number used for randomness in the requested term
    - **Randomness:** Randomness computed for the requested term

#### 6.2.2.12. Term randomness

- **Inputs:**
    - **Term ID:** Identification number of the term being queried
- **Pre-flight checks:**
    - Ensure the term was already transitioned
- **Outputs:**
    - **Term randomness:** Randomness of the requested term

#### 6.2.2.13. Are withdrawals allowed for

- **Inputs:**
    - **Address:** Address of the token holder querying if withdrawals are allowed for
- **Pre-flight checks:** None
- **Outputs:**
    - **Allowed:** True if the given holder accepts automatic withdrawals of their tokens, false otherwise

#### 6.2.2.14. Funds governor

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Funds governor:** Address of the funds governor

#### 6.2.2.15. Config governor

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Config governor:** Address of the config governor

#### 6.2.2.16. Modules governor

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Modules governor:** Address of the modules governor

#### 6.2.2.17. Is module active

- **Inputs:**
    - **Module ID:** ID of the module being queried
    - **Address:** Address of the module being queried
- **Pre-flight checks:**
    - Ensure that the given ID matches the ID of the requested module
- **Outputs:**
    - **Active:** Whether the requested module is active

#### 6.2.2.18. Module by address

- **Inputs:** 
    - **Address:** Address of the module being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Module ID:** ID of the module associated to the given address
    - **Active:** Whether the requested module is active

#### 6.2.2.19. Module by ID

- **Inputs:**
    - **Module ID:** ID of the module being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Module address:** Address of the module queried

#### 6.2.2.20. Custom function

- **Inputs:** 
    - **Signature:** Signature of the function being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Address:** Address of the target where the given signature will be forwarded

#### 6.2.2.21. Dispute Manager

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Protocol address:** Address of the `DisputeManager` module set

#### 6.2.2.22. Guardians registry

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Guardians registry address:** Address of the `GuardiansRegistry` module set

#### 6.2.2.23. Voting

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Voting address:** Address of the `Voting` module set

#### 6.2.2.24. PaymentsBook

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Payments book address:** Address of the `PaymentsBook` module set

#### 6.2.2.25. Treasury

- **Inputs:** None
- **Pre-flight checks:** None
- **Outputs:**
    - **Treasury address:** Address of the `Treasury` module set

#### 6.2.2.26. Has role

- **Inputs:**
    - **Who**: Address of the entity being queried
    - **Role**: ID of the role being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Has:** Whether the given entity has the requested role or not

#### 6.2.2.27. Is role frozen

- **Inputs:**
    - **Role**: ID of the role being queried
- **Pre-flight checks:** None
- **Outputs:**
    - **Frozen:** Whether the given role is frozen or not
