## 5.5. PaymentsBook

The following objects are the data-structures used by the `PaymentsBook`:

### 5.5.1. Period

The period object includes the following fields:

- **Balance checkpoint:** Term identification number of a period used to fetch the total active balance of the jurors registry
- **Total active balance:** Total amount of juror tokens active in the Court at the corresponding period checkpoint
- **Juror fees:** List of total amount of fees collected for the jurors during a period indexed by token
- **Governor fees:** List of total amount of fees accumulated for the governor of the Court during a period indexed by token
- **Claimed juror fees:** List of jurors that have claimed fees during a period, indexed by juror address and token
