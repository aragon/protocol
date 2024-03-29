## 5.5. PaymentsBook

The following objects are the data-structures used by the `PaymentsBook`:

### 5.5.1. Period

The period object includes the following fields:

- **Balance checkpoint:** Term identification number of a period used to fetch the total active balance of the guardians registry
- **Total active balance:** Total amount of guardian tokens active in the Court at the corresponding period checkpoint
- **Guardians shares:** List of total amount collected for the guardians during a period indexed by token
- **Governor shares:** List of total amount collected for the governor during a period indexed by token
- **Claimed guardians:** List of guardians that have claimed their share for a period, indexed by guardian address and token
