## 4.7. Treasury

The `Treasury` module is in charge of handling the token assets related to the disputes process.
The staked ANT of the guardians and the payments fees of the users are the only assets excluded from the `Treasury`; those are handled in the `GuardianRegistry` and `PaymentBook`, respectively.
Except from those, the `Treasury` stores the rest of the fees, deposits, and collaterals required to back the different adjudication rounds of a dispute.

### 4.7.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Controller:** Address of the `Controller` contract that centralizes all the modules being used
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the controller address is a contract
- **State transitions:**
    - Save the controller address

### 4.7.2. Assign

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token to be withdrawn
    - **Recipient:** Address that will receive the funds being withdrawn
    - **Amount:** Amount of tokens to be transferred to the recipient
- **Authentication:** Only active `DisputeManager` modules
- **Pre-flight checks:**
    - Ensure that the requested amount is greater than zero
- **State transitions:**
    - Increase the token balance of the recipient based on the requested amount

### 4.7.3. Withdraw

- **Actor:** External entity owning a certain amount of tokens of the `Treasury` module or an authorized role holder.
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token to be withdrawn
    - **From:** Address withdrawing the tokens from
    - **Recipient:** Address that will receive the funds being withdrawn
    - **Amount:** Amount of tokens to be transferred to the recipient
    - **Authorization:** Optional authorization granted by the voter in case of a third party sender
- **Authentication:** Open. Implicitly, only addresses that have some balance assigned in the `Treasury` module
- **Pre-flight checks:**
    - Validate signature if given
    - Ensure that the token balance of the caller is greater than zero
    - Ensure that the token balance of the caller is greater than or equal to the requested amount
- **State transitions:**
    - Update next nonce of the voter if a signature was given
    - Reduce the token balance of the caller based on the requested amount
    - Transfer the requested token amount to the recipient address, revert if the ERC20-transfer wasn't successful

### 4.7.5. Recover funds

- **Actor:** External entity in charge of maintaining the court funds (funds governor)
- **Inputs:**
    - **Token:** Address of the ERC20-compatible token or ETH to be recovered from the `Treasury` module
    - **Recipient:** Address that will receive the funds of the `Treasury` module
- **Authentication:** Only funds governor
- **Pre-flight checks:**
    - Ensure that the balance of the `Treasury` module is greater than zero
- **State transitions:**
    - Transfer the whole balance of the `Treasury` module to the recipient address, revert if the ERC20-transfer wasn't successful
