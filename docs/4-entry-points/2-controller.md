## 4.2. Controller

The `Controller` is core component of the architecture whose main responsibilities are permissions, modules, Protocol terms, Protocol configurations management.
To read more information about its responsibilities and structure, go to [section 2](../2-architecture).

### 4.2.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Term duration:** Duration in seconds per Protocol term
    - **First-term start time:** Timestamp in seconds when the Protocol will start
    - **Governor:** Object containing
        - **Funds governor:** Address of the governor allowed to manipulate module's funds
        - **Config governor:** Address of the governor allowed to manipulate protocol settings
        - **Modules governor:** Address of the governor allowed to manipulate module's addresses
    - **Settings:** Object containing
        - **Fee token:** Address of the token contract that is used to pay for the fees
        - **Guardian fee:** Amount of fee tokens paid per drafted guardian per dispute
        - **Draft fee:**  Amount of fee tokens per guardian to cover the drafting costs
        - **Settle fee:** Amount of fee tokens per guardian to cover round settlement costs
        - **Evidence terms:** Max submitting evidence period duration in Protocol terms
        - **Commit terms:** Duration of the commit phase in Protocol terms
        - **Reveal terms:** Duration of the reveal phase in Protocol terms
        - **Appeal terms:** Duration of the appeal phase in Protocol terms
        - **Appeal confirmation terms:** Duration of the appeal confirmation phase in Protocol terms
        - **Penalty permyriad:** ‱ of min active tokens balance to be locked for each drafted guardian (1/10,000)
        - **Final-round reduction:** ‱ of fee reduction for the last appeal round (1/10,000)
        - **First-round guardians number:** Number of guardians to be drafted for the first round of a dispute
        - **Appeal step factor:** Increasing factor for the number of guardians of each dispute round
        - **Max regular appeal rounds:** Number of regular appeal rounds before the final round is triggered
        - **Final round lock terms:** Number of terms that a coherent guardian in a final round is disallowed to withdraw
        - **Appeal collateral factor:** ‱ multiple of dispute fees (guardians, draft, and settlements) required to appeal a preliminary ruling (1/10,000)
        - **Appeal confirmation collateral factor:** ‱ multiple of dispute fees (guardians, draft, and settlements) required to confirm an appeal (1/10,000)
        - **Min active balance:** Minimum amount of guardian tokens that can be activated
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the term duration does not last longer than a year
    - Ensure that the first Protocol term has not started yet
    - Ensure that the first-term start time is at least scheduled one Protocol term ahead in the future
    - Ensure that the first-term start time is scheduled earlier than 2 years in the future
    - Ensure that each dispute phase duration is not longer than 8670 terms
    - Ensure that the penalty permyriad is not above 10,000‱
    - Ensure that the final round reduction permyriad is not above 10,000‱
    - Ensure that the first round guardians number is greater than zero
    - Ensure that the number of max regular appeal rounds is between [1-10]
    - Ensure that the appeal step factor is greater than zero
    - Ensure that the appeal collateral factor is greater than zero
    - Ensure that the appeal confirmation collateral factor is greater than zero
    - Ensure that the minimum guardians active balance is greater than zero
- **State transitions:**
    - Save the Protocol term duration
    - Create a new term object for the first Protocol term
    - Create the initial Protocol configuration object
    - Create the governor object

### 4.2.2. Set config

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **From term ID:** Identification number of the term in which the config will be effective at
    - **Settings:** Object containing
        - **Fee token:** Address of the token contract that is used to pay for the fees
        - **Guardian fee:** Amount of fee tokens paid per drafted guardian per dispute
        - **Draft fee:**  Amount of fee tokens per guardian to cover the drafting costs
        - **Settle fee:** Amount of fee tokens per guardian to cover round settlement costs
        - **Evidence terms:** Max submitting evidence period duration in Protocol terms
        - **Commit terms:** Duration of the commit phase in Protocol terms
        - **Reveal terms:** Duration of the reveal phase in Protocol terms
        - **Appeal terms:** Duration of the appeal phase in Protocol terms
        - **Appeal confirmation terms:** Duration of the appeal confirmation phase in Protocol terms
        - **Penalty permyriad:** ‱ of min active tokens balance to be locked for each drafted guardian (1/10,000)
        - **Final-round reduction:** ‱ of fee reduction for the last appeal round (1/10,000)
        - **First-round guardians number:** Number of guardians to be drafted for the first round of a dispute
        - **Appeal step factor:** Increasing factor for the number of guardians of each dispute round
        - **Max regular appeal rounds:** Number of regular appeal rounds before the final round is triggered
        - **Final round lock terms:** Number of terms that a coherent guardian in a final round is disallowed to withdraw
        - **Appeal collateral factor:** ‱ multiple of dispute fees (guardians, draft, and settlements) required to appeal a preliminary ruling (1/10,000)
        - **Appeal confirmation collateral factor:** ‱ multiple of dispute fees (guardians, draft, and settlements) required to confirm an appeal (1/10,000)
        - **Min active balance:** Minimum amount of guardian tokens that can be activated
- **Authentication:** Only config governor
- **Pre-flight checks:**
    - Ensure that the Protocol term is up-to-date. If not, perform a heartbeat before continuing the execution
    - Ensure that the config changes are being scheduled at least 2 terms in the future
    - Ensure that each dispute phase duration is not longer than 8670 terms
    - Ensure that the penalty permyriad is not above 10,000‱
    - Ensure that the final round reduction permyriad is not above 10,000‱
    - Ensure that the first round guardians number is greater than zero
    - Ensure that the number of max regular appeal rounds is between [1-10]
    - Ensure that the appeal step factor is greater than zero
    - Ensure that the appeal collateral factor is greater than zero
    - Ensure that the appeal confirmation collateral factor is greater than zero
    - Ensure that the minimum guardians active balance is greater than zero
- **State transitions:**
    - Update current Protocol term if needed
    - Create a new Protocol configuration object
    - Create a new future term object for the new configuration

### 4.2.3. Delay start time

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New first-term start time:** New timestamp in seconds when the Protocol will start
- **Authentication:** Allowed only to the config governor
- **Pre-flight checks:**
    - Ensure that the Protocol has not started yet
    - Ensure that the new proposed start time is in the future
- **State transitions:**
    - Update the protocol first term start time

### 4.2.4. Heartbeat

- **Actor:** Any entity incentivized to keep to Protocol term updated
- **Inputs:**
    - **Max allowed transitions:** Maximum number of transitions allowed, it can be set to zero to denote all the required transitions to update the Protocol to the current term
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the number of terms to be updated is greater than zero
- **State transitions:**
    - Update the Protocol term
    - Create a new term object for each transitioned new term

### 4.2.5. Ensure current term

- **Actor:** Any entity incentivized to keep to Protocol term updated
- **Inputs:** None
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the required number of transitions to update the Protocol term is not huge
- **State transitions:**
    - If necessary, update the Protocol term and create a new term object for each transitioned new term

### 4.2.6. Ensure current term randomness

- **Actor:** Any entity incentivized to compute the term randomness for the current term
- **Inputs:** None
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure a term object with that ID exists
- **State transitions:**
    - In case the term randomness has not been computed yet, set its randomness using the block hash of the following block when the term object was created

### 4.2.7. Set automatic withdrawals

- **Actor:** External entity holding funds in the protocol
- **Inputs:**
    - **Allowed:** Whether the automatic withdrawals for the sender are allowed or not
- **Authentication:** Open
- **Pre-flight checks:** None
- **State transitions:**
    - Update the automatic withdrawals config of the sender

### 4.2.8. Change funds governor

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New funds governor:** Address of the new funds governor to be set
- **Authentication:** Only funds governor
- **Pre-flight checks:**
    - Ensure that the new funds governor address is not zero
- **State transitions:**
    - Update the funds governor address

### 4.2.9. Change config governor

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New config governor:** Address of the new config governor to be set
- **Authentication:** Allowed only to the config governor
- **Pre-flight checks:**
    - Ensure that the new config governor address is not zero
- **State transitions:**
    - Update the config governor address

### 4.2.10. Change modules governor

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New modules governor:** Address of the new modules governor to be set
- **Authentication:** Allowed only to the modules governor
- **Pre-flight checks:**
    - Ensure that the new modules governor address is not zero
- **State transitions:**
    - Update the modules governor address

### 4.2.11. Eject funds governor

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:** None
- **Authentication:** Only funds governor
- **Pre-flight checks:** None
- **State transitions:**
    - Unset the funds governor address

### 4.2.12. Eject modules governor

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:** None
- **Authentication:** Only modules governor
- **Pre-flight checks:** None
- **State transitions:**
    - Unset the modules governor address

### 4.2.13. Set module

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Module ID:** Identification word of the module to be set
    - **Address:** Address of the module to be set
- **Authentication:** Only modules governor
- **Pre-flight checks:**
    - Ensure that the module address is a contract
- **State transitions:**
    - Set the module address for the corresponding module ID

### 4.2.14. Set modules

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Module IDs:** List of identification words of the modules to be set
    - **Addresses:** List of addresses of the modules to be set
- **Authentication:** Only modules governor
- **Pre-flight checks:**
    - Ensure both input lists have the same length
    - Ensure that the module addresses are contracts
- **State transitions:**
    - Save all the module addresses for their corresponding module ID
