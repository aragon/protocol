## 5.5. PaymentsBook

The following objects are the data-structures used by the `PaymentsBook`:

### 5.5.1. Period

The period object includes the following fields:

- **Balance checkpoint:** Term identification number of a period used to fetch the total active balance of the guardians registry
- **Total active balance:** Total amount of guardian tokens active in the Protocol at the corresponding period checkpoint
- **Guardian fees:** List of total amount of fees collected for the guardians during a period indexed by token
- **Governor fees:** List of total amount of fees accumulated for the governor of the Protocol during a period indexed by token
- **Claimed guardian fees:** List of guardians that have claimed fees during a period, indexed by guardian address and token
