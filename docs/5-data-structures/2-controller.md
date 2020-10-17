## 5.2. Controller

The following objects are the data-structures used by the `Controller`:

### 5.2.1. Governor

The governor object includes the following fields:

- **Funds:** Address allowed to recover funds from the recoverable modules
- **Config:** Address allowed to change the different configurations of the whole system
- **Modules:** Address allowed to plug/unplug modules from the system

### 5.2.2. Config

The config object includes the following fields:

- **Fees config:** Fees config object
- **Disputes config:** Disputes config object
- **Min active balance:** Minimum amount of tokens guardians have to activate to participate in the Court

### 5.2.3. Fees config

The fees config object includes the following fields:

- **Token:** ERC20 token to be used for the fees of the Court
- **Final round reduction:** Permyriad of fees reduction applied for final appeal round (1/10,000)
- **Guardian fee:** Amount of tokens paid to draft a guardian to adjudicate a dispute
- **Draft fee:** Amount of tokens paid per round to cover the costs of drafting guardians
- **Settle fee:** Amount of tokens paid per round to cover the costs of slashing guardians

### 5.2.4. Disputes config

The disputes config object includes the following fields:

- **Evidence terms:** Max submitting evidence period duration in Court terms
- **Commit terms:** Committing period duration in terms
- **Reveal terms:** Revealing period duration in terms
- **Appeal terms:** Appealing period duration in terms
- **Appeal confirmation terms:** Confirmation appeal period duration in terms
- **Penalty permyriad:** ‱ of min active tokens balance to be locked for each drafted guardian (1/10,000)
- **First round guardians number:** Number of guardians drafted on first round
- **Appeal step factor:** Factor in which the guardians number is increased on each appeal
- **Final round lock terms:** Period a coherent guardian in the final round will remain locked
- **Max regular appeal rounds:** Before the final appeal
- **Appeal collateral factor:** Permyriad multiple of dispute fees (guardians, draft, and settlements) required to appeal a preliminary ruling (1/10,000)
- **Appeal confirmation collateral factor:** Permyriad multiple of dispute fees (guardians, draft, and settlements) required to confirm appeal (1/10,000)

### 5.2.5. Term

The term object includes the following fields:

- **Start time:** Timestamp when the term started
- **Randomness block number:** Block number for entropy
- **Randomness:** Entropy from randomness block number's hash
