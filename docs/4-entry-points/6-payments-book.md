# 4.6. PaymentsBook

The `PaymentsBook` module is in charge of collecting any extra payments paid by users to use Aragon Protocol.
This module is simply in charge of collecting any type of payment and distributing it to the corresponding parties: guardians and the governor.
Aragon Protocol does not explicitly require users to provide these extra payments on-chain. The idea is that any custom mechanism can be built on top and then verified by guardians handling arising disputes.

### 4.6.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Controller:** Address of the `Controller` contract that centralizes all the modules being used
    - **Period duration:** Duration of the payment period in Protocol terms
    - **Governor share permyriad:** Initial ‱ of the collected payments that will be saved for the governor (1/10,000)
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the controller address is a contract
    - Ensure that the period duration is greater than zero
    - Ensure that the new governor share permyriad is not above 10,000‱
- **State transitions:**
    - Save the controller address
    - Save the period duration
    - Save the governor share permyriad

### 4.6.2. Pay

- **Actor:** Users of the Protocol
- **Inputs:**
    - **Token:** Address of the token being used for the payment
    - **Amount:** Amount of tokens being paid
    - **Payer:** Address assigning the payment to
    - **Data:** Optional data to be logged
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the payment amount is greater than zero
- **State transitions:**
    - Update the total amount collected for guardians during the current period
    - Update the total amount collected for the governor during the current period
    - Pull the corresponding amount of tokens from the sender to be deposited in the `PaymentsBook` module, revert if the EC20-transfer wasn't successful or if the ETH received does not match the requested one

### 4.6.3. Claim guardian share

- **Actor:** Guardians of the Protocol
- **Inputs:**
    - **Period ID:** Period identification number
    - **Tokens:** List of addresses of the tokens being claimed
- **Authentication:** Open. Implicitly, only guardians that have certain amount of ANT tokens activated during the requested period can call this function
- **Pre-flight checks:**
    - Ensure that the requested period has already ended
    - Ensure that the sender has not claimed their share for the requested token and period
    - Ensure that the sender's share is greater than zero for the requested token and period
- **State transitions:**
    - Compute period balance checkpoint if it wasn't computed yet
    - Mark the sender's share as claimed for the requested period and token
    - Transfer the corresponding tokens to the sender, revert if the transfer wasn't successful

### 4.6.4. Claim governor share

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Period ID:** Period identification number
    - **Tokens:** List of addresses of the tokens being claimed
- **Authentication:** Check the given period is a past period
- **Pre-flight checks:**
    - Ensure that the requested period has already ended
    - Ensure that the governor has not claimed their share for the requested token and period
    - Ensure that the governor's share is greater than zero for the requested token and period
- **State transitions:**
    - Mark the governor's share as claimed for the requested period and token
    - Transfer the corresponding tokens to the config governor address, revert if the transfer wasn't successful

### 4.6.5. Ensure period balance details

- **Actor:** External entity incentivized in updating the parameters to determine the guardian's share for each period
- **Inputs:**
    - **Period ID:** Period identification number
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the last term included in the requested period has already started
- **State transitions:**
    - Pick a random term checkpoint included in the requested period using the next period's start term randomness, and save the total ANT active balance in the `GuardiansRegistry` at that term for the requested period

### 4.6.12. Set governor share permyriad

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **New governor share permyriad:** New ‱ of the collected payments that will be saved for the governor (1/10,000)
- **Authentication:** Only config governor
- **Pre-flight checks:**
    - Ensure that the new governor share permyriad is not above 10,000‱
- **State transitions:**
    - Update the governor share permyriad

### 4.6.13. Recover funds

- **Actor:** External entity in charge of maintaining the protocol
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token or ETH to be recovered from the `PaymentsBook` module
    - **Recipient:** Address that will receive the funds of the `PaymentsBook` module
- **Authentication:** Only funds governor
- **Pre-flight checks:**
    - Ensure that the balance of the `PaymentsBook` module is greater than zero
- **State transitions:**
    - Transfer the whole balance of the `PaymentsBook` module to the recipient address, revert if the transfer wasn't successful
