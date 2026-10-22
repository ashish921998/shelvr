# Delete an account

From the disposable anonymous development account: Profile > Settings > Delete
account, then confirm. The app returns to sign-in. A new dev sign-in opens an
empty Home without the previous account's fixture saves.

`tests/account-deletion.e2e.ts` resets the dev fixtures first. It needs no model
key. It never targets a real account: the fixture reset refuses non-development
anonymous users. The test proves the visible transition and next-session state,
not the database drain; `.agents/skills/account-deletion` covers that separately.

During deletion, signed-in screens unmount before their owner disappears. Normal
sign-out revokes this device's Siri capture token; account deletion drains those
tokens on the server, so its final local sign-out must not revoke them again.

## Charter

```
account-deletion|ios|skeptic|On the seeded anonymous development account, delete the account through Settings, confirm sign-in appears, then sign in as a new dev user and check none of the old fixture saves appear
```
