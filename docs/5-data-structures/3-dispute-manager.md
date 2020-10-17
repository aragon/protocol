## 5.3. Dispute Manager

The following objects are the data-structures used by the `DisputeManager`:

### 5.3.1. Dispute

The dispute object includes the following fields:

- **Subject:** Arbitrable instance associated to a dispute
- **Possible rulings:** Number of possible rulings guardians can vote for each dispute
- **Creation term ID:** Identification number when the dispute was created
- **Final ruling:** Winning ruling of a dispute
- **Dispute state:** State of a dispute: pre-draft, adjudicating, or ruled
- **Adjudication rounds:** List of adjudication rounds for each dispute

### 5.3.2. Adjudication round

The adjudication round object includes the following fields:

- **Draft term ID:** Term from which the guardians of a round can be drafted
- **Guardians number:** Number of guardians drafted for a round
- **Settled penalties:** Whether or not penalties have been settled for a round
- **Guardian fees:** Total amount of fees to be distributed between the winning guardians of a round
- **Guardians:** List of guardians drafted for a round
- **Guardians states:** List of states for each drafted guardian indexed by address
- **Delayed terms:** Number of terms a round was delayed based on its requested draft term id
- **Selected guardians:** Number of guardians selected for a round, to allow drafts to be batched
- **Coherent guardians:** Number of drafted guardians that voted in favor of the dispute final ruling
- **Settled guardians:** Number of guardians whose rewards were already settled
- **Collected tokens:** Total amount of tokens collected from losing guardians
- **Appeal:** Appeal-related information of a round

### 5.3.3. Guardian state

The guardian state object includes the following fields:

- **Weight:** Weight computed for a guardian on a round
- **Rewarded:** Whether or not a drafted guardian was rewarded

### 5.3.4. Appeal

The appeal object includes the following fields:

- **Maker:** Address of the appealer
- **Appealed ruling:** Ruling appealing in favor of
- **Taker:** Address of the one confirming an appeal
- **Opposed ruling:** Ruling opposed to an appeal
- **Settled:** Whether or not an appeal has been settled
