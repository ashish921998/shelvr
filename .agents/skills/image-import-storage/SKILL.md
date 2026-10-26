---
name: image-import-storage
description: TLA+ model check of the photo save pipeline (beginImageImport, the /image-upload receiver, attachImageUpload, finalizeImageImport, deleteItem, and the stale-import and orphan-storage crons). Use before changing any of those functions, isStorageUnreferenced, or any code that deletes _storage blobs, and to check that a change cannot leave a saved photo pointing at a deleted blob.
---

# Image import storage model

**What it promises.** A saved photo never loses its image. If one of these broke, a
user's photo would show blank forever, or a photo save would fail on every retry.

**How it is checked.** `tools/formal/image-import/ImageImport.tla` is a TLA+ model of
the code below. TLC explores every order in which these steps can run, for 2 imports,
2 concurrent upload requests, 4 blob ids and 3 item ids. It takes about 15 seconds.
Each Convex mutation is one serializable transaction, so each mutation is one step in
the model. The only extra step is `Store`: the receiver action's `ctx.storage.store`,
which runs between its two mutations.

## Properties

| Invariant           | Plain meaning                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ItemBlobExists`    | A saved photo's `storageId` always names a blob that exists                                                                                |
| `NoSharedBlob`      | Two saves never share a blob, so deleting one can't blank the other                                                                        |
| `PendingBlobExists` | A pending import never holds a deleted blob. If it did, `finalizeImageImport` would throw "Storage object not found" until the 24h cleanup |

## Run it

From the repo root (needs Java 11+; the script downloads a pinned TLC 1.7.4 and checks
its SHA-256):

```bash
tools/formal/run-tlc.sh tools/formal/image-import/ImageImport.tla
```

A pass ends with `Model checking completed. No error has been found.` A failure prints
`Error: Invariant <name> is violated.` and a numbered trace of states, one action per
step.

## Coverage

Last confirmed to describe the code at **68b06180**. Move this commit forward only
after you have checked that every action below still matches its function at the new
commit.

| Model action   | Code                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `Begin`        | `beginImageImportForUser`, `apps/native/convex/items.ts`                  |
| `Claim`        | `claimImageUpload`, `items.ts`                                            |
| `Store`        | `ctx.storage.store` in `receiveImageUpload`, `apps/native/convex/http.ts` |
| `Finish`       | `finishImageUpload` with a `storageId`, `items.ts`                        |
| `Abort`        | the `finally` call to `finishImageUpload` with no `storageId`, `http.ts`  |
| `Attach`       | `attachImageUploadForUser`, `items.ts`                                    |
| `Finalize`     | `finalizeImageImportForUser`, `items.ts`                                  |
| `DeleteItem`   | `deleteItem`, `items.ts`                                                  |
| `StaleCleanup` | `cleanupStaleImageImports`, `items.ts`                                    |
| `OrphanSweep`  | `cleanupOrphanStorage`, `items.ts`                                        |
| `Unreferenced` | `isStorageUnreferenced`, `items.ts`                                       |
| `Delete`       | `safeDeleteStorage`, `apps/native/convex/model/storage.ts`                |

To see whether covered code moved since the sync commit:

```bash
git log --oneline 68b06180..HEAD -- apps/native/convex/items.ts apps/native/convex/http.ts apps/native/convex/model/storage.ts
```

Then read the diff of each listed function, not just the commit messages.

## Assumptions and widenings

Widenings only add behaviours, so a pass still holds for the real code:

- A receiver can claim any pending import. The real code needs that import's current
  upload token.
- A claim can be taken over at any time. The real code waits out a 60-second busy
  window first.
- Stale cleanup can delete any pending import. The real code waits until it has been
  idle for 24h.
- Pro, quota, rate-limit and validation checks are left out. They only make a mutation
  throw, and a throw writes nothing.

Assumptions narrow the model. If one stops being true, the model must change:

- `OrphanSweep` never deletes a blob that a receiver request still holds. The sweep
  only sees blobs older than 48h, and a request ends within Convex's 10-minute action
  limit.
- `Attach` is only called with storage ids a client has already seen in a response
  (the model's `known` set). Ids are unguessable.
- Stored blobs always pass `imageSizeError`, because the receiver checks the size
  before it stores. That makes the size-error branch of `attachImageUploadForUser`
  unreachable, so it is not modelled.
- Blob and item ids are never reused.

## What it does not cover

- **Leaks.** A blob orphaned when a `finishImageUpload` call throws after `store` is
  not tracked. The orphan sweep is meant to collect it, and the model has no property
  that says it does.
- **Link poster blobs.** `ai.ts` stores these, and `finalizeItem` swaps them.
- **Account deletion** (`users.ts`). The `account-deletion` skill covers it.
- **Liveness.** The model does not show that a save eventually finishes.

## When a change touches covered code

1. Find the actions in the table above that the change touches. Rewrite each one from
   the new code before you run anything. Keep one mutation as one action. Never shape
   the model around what makes TLC pass.
2. If the change splits a mutation, add a new action. If a new function writes
   `storageId` or deletes a blob, add it to `Next` and to the coverage table.
3. Change an invariant only when the promise itself changed on purpose, and cite the
   evidence (doc comment, test, PR description).
4. Run the check.
5. **If it passes**, break the new code in the model: remove the guard you added, or
   reorder the step. Confirm TLC catches it, then undo the break.
6. **If it fails**, replay the trace against the real code, one step at a time:
   - **Modeling error:** one of the steps cannot happen in the code, for example a
     guard the model forgot. Fix the model.
   - **Bug:** every step can happen. Report it as steps in the code's own words, with
     the commit that introduced it. Do not weaken the invariant.
7. Update the coverage table and the sync commit.

## Showing the check can fail

Each invariant fails when the model mirrors one of these one-line breaks:

- **`NoSharedBlob`:** drop `isStorageUnreferenced` from the `op === null` branch of
  `attachImageUploadForUser`. In the model, remove `/\ Unreferenced(b, None)` from the
  `"absent"` case of `Attach`.
- **`PendingBlobExists`:** let `cleanupOrphanStorage` check only items, the way
  `deleteStorageIfUnreferenced` does. In the model, replace `Unreferenced(b, None)` in
  `OrphanSweep` with `~\E i \in Items : item[i].exists /\ item[i].storage = b`.
- **`ItemBlobExists`** (and the other two): drop `isStorageUnreferenced` from the
  `op.status === "complete"` branch of `attachImageUploadForUser`. In the model,
  `Attach` then deletes another save's blob when a client attaches that blob's id.

Make the edit in a copy of the model (`Broken.tla`, with its `MODULE` line renamed),
run it with `-config ImageImport.cfg`, then delete the copy.
