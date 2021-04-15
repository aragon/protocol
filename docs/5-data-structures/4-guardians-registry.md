## 5.3. Guardians Registry

The following objects are the data-structures used by the `GuardiansRegistry`:

### 5.3.1. Guardian

The guardian object includes the following fields:

- **ID:** Identification number of each guardian
- **Locked balance:** Maximum amount of tokens that can be slashed based on the guardian's drafts
- **Active balance:** Tokens activated for the Court that can be locked in case the guardian is drafted
- **Available balance:** Available tokens that can be withdrawn at any time
- **Withdrawals lock term ID:** Term identification number until which guardian's withdrawals will be locked
- **Deactivation request:** Pending deactivation request of a guardian

### 5.3.2. Deactivation request

The deactivation request object includes the following fields:

- **Amount:** Amount requested for deactivation
- **Available termId:** ID of the term when guardians can withdraw their requested deactivation tokens

### 5.3.2. Activation locks

The activation locks object includes the following fields:

- **Total:** Total amount of active balance locked for a guardian
- **Available termId:** List of locked amounts indexed by lock manager
