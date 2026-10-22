# Delete an account

From the disposable anonymous development account: Profile > Settings > Delete
account, then confirm. The app returns to sign-in. A new dev sign-in opens an
empty Home without the previous account's fixture saves.

`tests/account-deletion.e2e.ts` always resets fixtures through Settings first,
including when other tests use backend reset. It needs no model key.
It never targets a real account: the fixture reset refuses non-development
anonymous users. The test proves the visible transition and next-session state,
not the database drain; `.agents/skills/account-deletion` covers that separately.

During deletion, the root layout unmounts signed-in screens before their owner
disappears. Both sign-out and deletion revoke push tokens, then this device's
Siri capture token, while the account still exists. A failed deletion keeps the
account signed in but remounts the navigator: after dismissing the failure alert,
the user returns to Home, not the previous Settings sheet.

## Charter

```
account-deletion|ios|skeptic|On the seeded anonymous development account, delete the account through Settings, confirm sign-in appears, then sign in as a new dev user and check none of the old fixture saves appear
```
