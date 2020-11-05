# Diffs

Diffs generated from flattened source files for each deployed contract. Some internal contracts may be omitted to reduce noise, as noted at the start of each file.

## Changes

### Aragon Court 1.2.0 (with terminology renames) -> Aragon Protocol

Best diffs to view logical changes for each contract. Noise from terminology changes is minimized.

- [AragonProtocol.sol](https://www.diffchecker.com/hLh1kwiT)
- [CRVoting.sol](https://www.diffchecker.com/Ae2etUg3)
- [DisputeManager.sol](https://www.diffchecker.com/rpe6ShCK)
- [GuardiansRegistry.sol](https://www.diffchecker.com/zcFgRt7m)
- [PaymentsBook.sol](https://www.diffchecker.com/DAtav3bK)
  - Note that the `PaymentsBook` module is an entirely new module for Aragon Protocol that should not be directly compared to `Subscriptions`. The diff between the two here is only intended to highlight similarities in some internal logic.
- [ProtocolTreasury.sol](https://www.diffchecker.com/nNzRNqoh)

### Aragon Court 1.2.0 -> Aragon Court 1.2.0 (with terminology renames)

Diff to view the terminology changes.

- [AragonCourt.sol](https://www.diffchecker.com/DMmIfgNp)
- [CRVoting.sol](https://www.diffchecker.com/DTN8PIMG)
- [DisputeManager.sol](https://www.diffchecker.com/Cm2stlzG)
- [GuardiansRegistry.sol](https://www.diffchecker.com/3xpjvMJL)
- [Subscriptions.sol](https://www.diffchecker.com/V5vWV34O)
- [CourtTreasury.sol](https://www.diffchecker.com/SEf2CAop)

## Source files

- [protocol-audit](./protocol-audit): Aragon Protocol 1.0.0-audit
- [court-rename](./court-rename): Aragon Court 1.2.0 (with terminology renames)
  - 1:1 logic to Aragon Court 1.2.0, but with terminology changes applied
- [court-1.2.0](./court-1.2.0): Aragon Court 1.2.0
  - Note that Aragon Court 1.2.0 was never deployed and includes the App Fees Subscription module
