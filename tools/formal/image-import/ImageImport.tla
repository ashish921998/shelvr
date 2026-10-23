---------------------------- MODULE ImageImport ----------------------------
(***************************************************************************)
(* The photo save pipeline in apps/native/convex/items.ts and the          *)
(* /image-upload receiver in apps/native/convex/http.ts, with the two      *)
(* cleanup crons that delete storage. Every action below is one Convex     *)
(* mutation (one serializable transaction), except Store, which is the     *)
(* receiver action's ctx.storage.store between its two mutations.          *)
(*                                                                         *)
(* Questions it answers: can a saved photo point at a deleted blob, can    *)
(* two saves share one blob, and can a pending import hold a deleted blob. *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS
    Ops,        \* itemOperations rows, one per (userId, operationId)
    Receivers,  \* concurrent POST /image-upload requests
    Blobs,      \* pool of _storage ids
    Items,      \* pool of items ids
    None

VARIABLES
    op,         \* op[o]: the itemOperations row, st = "absent" once deleted
    blobs,      \* _storage ids that exist
    used,       \* _storage ids ever allocated (ids are never reused)
    item,       \* item[i]: the items row
    rcv,        \* rcv[r]: where each receiver request is
    known       \* _storage ids a client has seen in a response

vars == <<op, blobs, used, item, rcv, known>>

NoOp == [st |-> "absent", storage |-> None, item |-> None, claim |-> None]
NoItem == [exists |-> FALSE, storage |-> None]
Idle == [pc |-> "idle", op |-> None, blob |-> None]

TypeOK ==
    /\ op \in [Ops -> [st : {"absent", "pending", "complete"},
                       storage : Blobs \cup {None},
                       item : Items \cup {None},
                       claim : Receivers \cup {None}]]
    /\ blobs \subseteq used /\ used \subseteq Blobs
    /\ item \in [Items -> [exists : BOOLEAN, storage : Blobs \cup {None}]]
    /\ rcv \in [Receivers -> [pc : {"idle", "claimed", "stored"},
                              op : Ops \cup {None},
                              blob : Blobs \cup {None}]]
    /\ known \subseteq used

Init ==
    /\ op = [o \in Ops |-> NoOp]
    /\ blobs = {} /\ used = {}
    /\ item = [i \in Items |-> NoItem]
    /\ rcv = [r \in Receivers |-> Idle]
    /\ known = {}

\* isStorageUnreferenced(ctx, b, ex): no item row and no itemOperations row
\* other than ex has storageId = b.
Unreferenced(b, ex) ==
    /\ ~\E i \in Items : item[i].exists /\ item[i].storage = b
    /\ ~\E o \in Ops \ {ex} : op[o].st /= "absent" /\ op[o].storage = b

\* safeDeleteStorage: deletes the blob when it still exists.
Delete(b) == blobs' = blobs \ {b}

-----------------------------------------------------------------------------
(* beginImageImportForUser. The 55-minute "reuse the issued URL" branch is *)
(* left out: it changes nothing. Pro and quota checks only abort.          *)

Begin(o) ==
    /\ ~(op[o].st = "complete" /\ op[o].item /= None /\ item[op[o].item].exists)
    /\ CASE op[o].st = "absent" ->
              /\ op' = [op EXCEPT ![o] = [NoOp EXCEPT !.st = "pending"]]
              /\ UNCHANGED blobs
         [] op[o].st = "complete" ->
              /\ IF op[o].storage /= None /\ Unreferenced(op[o].storage, o)
                   THEN Delete(op[o].storage) ELSE UNCHANGED blobs
              /\ op' = [op EXCEPT ![o] = [NoOp EXCEPT !.st = "pending"]]
         [] op[o].st = "pending" ->
              \* a new upload token; uploadClaimedAt cleared
              /\ op' = [op EXCEPT ![o].claim = None]
              /\ UNCHANGED blobs
    /\ UNCHANGED <<used, item, rcv, known>>

(* claimImageUpload. Token checks are widened to "any pending op"; the     *)
(* 60-second busy window is widened to "a claim can be taken over at any   *)
(* time". Both only add behaviours.                                        *)

Claim(r, o) ==
    /\ rcv[r].pc = "idle"
    /\ op[o].st /= "absent"
    /\ IF op[o].storage /= None
         THEN \* kind "stored": answers with the attached id, no write
              /\ known' = known \cup {op[o].storage}
              /\ UNCHANGED <<op, rcv>>
         ELSE /\ op[o].st = "pending"
              /\ op' = [op EXCEPT ![o].claim = r]
              /\ rcv' = [rcv EXCEPT ![r] = [pc |-> "claimed", op |-> o, blob |-> None]]
              /\ UNCHANGED known
    /\ UNCHANGED <<blobs, used, item>>

\* ctx.storage.store(blob) in receiveImageUpload. Size is checked before
\* store, so stored blobs always pass imageSizeError.
Store(r) ==
    /\ rcv[r].pc = "claimed"
    /\ \E b \in Blobs \ used :
         /\ used' = used \cup {b}
         /\ blobs' = blobs \cup {b}
         /\ rcv' = [rcv EXCEPT ![r].pc = "stored", ![r].blob = b]
    /\ UNCHANGED <<op, item, known>>

\* finishImageUpload with a storageId.
Finish(r) ==
    LET o == rcv[r].op
        b == rcv[r].blob
    IN /\ rcv[r].pc = "stored"
       /\ IF op[o].st = "pending" /\ op[o].claim = r /\ op[o].storage = None
            THEN /\ op' = [op EXCEPT ![o].storage = b, ![o].claim = None]
                 /\ known' = known \cup {b}
                 /\ UNCHANGED blobs
            ELSE /\ IF Unreferenced(b, None) THEN Delete(b) ELSE UNCHANGED blobs
                 /\ UNCHANGED <<op, known>>
       /\ rcv' = [rcv EXCEPT ![r] = Idle]
       /\ UNCHANGED <<used, item>>

\* The finally block: finishImageUpload with no storageId after an error
\* before store (body too large, bad size).
Abort(r) ==
    LET o == rcv[r].op
    IN /\ rcv[r].pc = "claimed"
       /\ IF op[o].st = "pending" /\ op[o].claim = r /\ op[o].storage = None
            THEN op' = [op EXCEPT ![o].claim = None]
            ELSE UNCHANGED op
       /\ rcv' = [rcv EXCEPT ![r] = Idle]
       /\ UNCHANGED <<blobs, used, item, known>>

(* attachImageUploadForUser, called with any storage id a client has seen. *)
(* The size-error branch is unreachable: only checked blobs are stored.    *)

Attach(o, b) ==
    /\ b \in known
    /\ CASE op[o].st = "absent" ->
              /\ b \in blobs /\ Unreferenced(b, None)
              /\ op' = [op EXCEPT ![o] = [NoOp EXCEPT !.st = "pending", !.storage = b]]
              /\ UNCHANGED blobs
         [] op[o].st = "complete" ->
              /\ IF b /= op[o].storage /\ Unreferenced(b, None)
                   THEN Delete(b) ELSE UNCHANGED blobs
              /\ UNCHANGED op
         [] op[o].storage /= None /\ op[o].storage /= b ->
              /\ IF Unreferenced(b, None) THEN Delete(b) ELSE UNCHANGED blobs
              /\ UNCHANGED op
         [] op[o].storage = None ->
              /\ b \in blobs /\ Unreferenced(b, None)
              /\ op' = [op EXCEPT ![o].storage = b]
              /\ UNCHANGED blobs
         [] OTHER -> UNCHANGED <<op, blobs>>   \* op.storageId = b
    /\ UNCHANGED <<used, item, rcv, known>>

\* finalizeImageImportForUser.
Finalize(o) ==
    /\ op[o].st = "pending"
    /\ op[o].storage /= None
    /\ op[o].storage \in blobs          \* else "Storage object not found"
    /\ \E i \in Items :
         /\ ~item[i].exists /\ item[i].storage = None   \* a fresh id
         /\ item' = [item EXCEPT ![i] = [exists |-> TRUE, storage |-> op[o].storage]]
         /\ op' = [op EXCEPT ![o].st = "complete", ![o].item = i]
    /\ UNCHANGED <<blobs, used, rcv, known>>

\* deleteItem: drops the ops whose itemId is i, then the blob, then the row.
\* The tombstone keeps the id from being reused.
DeleteItem(i) ==
    /\ item[i].exists
    /\ op' = [o \in Ops |-> IF op[o].st /= "absent" /\ op[o].item = i
                              THEN NoOp ELSE op[o]]
    /\ Delete(item[i].storage)
    /\ item' = [item EXCEPT ![i].exists = FALSE]
    /\ UNCHANGED <<used, rcv, known>>

\* cleanupStaleImageImports. "updatedAt older than 24h" is widened to any
\* pending op.
StaleCleanup(o) ==
    /\ op[o].st = "pending"
    /\ IF op[o].storage /= None /\ Unreferenced(op[o].storage, o)
         THEN Delete(op[o].storage) ELSE UNCHANGED blobs
    /\ op' = [op EXCEPT ![o] = NoOp]
    /\ UNCHANGED <<used, item, rcv, known>>

\* cleanupOrphanStorage. Assumption: it only sees blobs created over 48h ago,
\* and a receiver request finishes within the 10-minute action limit, so a
\* blob a receiver still holds is never old enough.
OrphanSweep(b) ==
    /\ b \in blobs
    /\ Unreferenced(b, None)
    /\ ~\E r \in Receivers : rcv[r].blob = b
    /\ Delete(b)
    /\ UNCHANGED <<op, used, item, rcv, known>>

Next ==
    \/ \E o \in Ops : Begin(o) \/ Finalize(o) \/ StaleCleanup(o)
    \/ \E r \in Receivers : Store(r) \/ Finish(r) \/ Abort(r)
    \/ \E r \in Receivers, o \in Ops : Claim(r, o)
    \/ \E o \in Ops, b \in Blobs : Attach(o, b)
    \/ \E i \in Items : DeleteItem(i)
    \/ \E b \in Blobs : OrphanSweep(b)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties *)

\* A saved photo never points at a deleted blob (it would show blank forever).
ItemBlobExists ==
    \A i \in Items : item[i].exists => item[i].storage \in blobs

\* Two saves never share a blob (deleting one would blank the other).
NoSharedBlob ==
    \A i, j \in Items :
        (i /= j /\ item[i].exists /\ item[j].exists)
            => item[i].storage /= item[j].storage

\* A pending import never holds a deleted blob (finalize would throw
\* "Storage object not found" on every retry until the 24h cleanup).
PendingBlobExists ==
    \A o \in Ops : (op[o].st = "pending" /\ op[o].storage /= None)
                       => op[o].storage \in blobs
=============================================================================
