## 4.5. Voting

The `Voting` module is in charge of handling all the votes submitted by the drafted guardians and computing the tallies to ensure the final ruling of a dispute once finished.
In particular, the first version of the protocol uses a commit-reveal mechanism. Therefore, the `Voting` module allows guardians to commit and reveal their votes, and leaked other guardians votes.

### 4.5.1. Constructor

- **Actor:** Deployer account
- **Inputs:**
    - **Controller:** Address of the `Controller` contract that centralizes all the modules being used
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure that the controller address is a contract
- **State transitions:**
    - Save the controller address

### 4.5.2. Set representative

- **Actor:** Any guardian that could potentially be drafted for an adjudication round
- **Inputs:**
    - **Representatives:** List of representatives addresses
    - **Allowed:** Whether each representative is allowed or not
- **Authentication:** Open
- **Pre-flight checks:** None
- **State transitions:**
    - Update allowance status for each of the representatives in the list

### 4.5.3. Create

- **Actor:** `DisputeManager` module
- **Inputs:**
    - **Vote ID:** Vote identification number
- **Authentication:** Only the current `DisputeManager` module
- **Pre-flight checks:**
    - Ensure there is no other existing vote for the given vote ID
- **State transitions:**
    - Create a new vote object

### 4.5.3. Commit

- **Actor:** Guardian drafted for an adjudication round
- **Inputs:**
    - **Vote ID:** Vote identification number
    - **Voter:** Address of the voter committing the vote for
    - **Commitment:** Hashed outcome to be stored for future reveal
    - **Authorization:** Optional authorization granted by the voter in case of a third party sender
- **Authentication:** Only the voter or an external account allowed by signature. Implicitly, only guardians that were drafted for the corresponding adjudication round can call this function.
- **Pre-flight checks:**
    - Validate signature if given
    - Ensure a vote object with that ID exists
    - Ensure that the sender was drafted for the corresponding dispute's adjudication round
    - Ensure that the sender has not committed a vote before
    - Ensure that votes can still be committed for the adjudication round
- **State transitions:**
    - Update next nonce of the voter if a signature was given
    - Create a cast vote object for the sender

### 4.5.4. Leak

- **Actor:** External entity incentivized to slash a guardian
- **Inputs:**
    - **Vote ID:** Vote identification number
    - **Voter:** Address of the voter to leak a vote of
    - **Outcome:** Outcome leaked for the voter
    - **Salt:** Salt to decrypt and validate the committed vote of the voter
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure the voter commitment can be decrypted with the provided outcome and salt values
    - Ensure that votes can still be committed for the adjudication round
- **State transitions:**
    - Update the voter's cast vote object marking it as leaked

### 4.5.5. Reveal

- **Actor:** Guardian drafted for an adjudication round
- **Inputs:**
    - **Vote ID:** Vote identification number
    - **Voter:** Address of the voter revealing a vote for
    - **Outcome:** Outcome leaked for the voter
    - **Salt:** Salt to decrypt and validate the committed vote of the voter
- **Authentication:** Open
- **Pre-flight checks:**
    - Ensure the voter commitment can be decrypted with the provided outcome and salt values
    - Ensure the resultant outcome is valid
    - Ensure that votes can still be revealed for the adjudication round
- **State transitions:**
    - Update the voter's cast vote object saving the corresponding outcome
    - Update the vote object tally
