# Shelvr

Shelvr is a save-it-for-later app: people capture links, images and notes, and Shelvr reads and organizes them.

## Language

**Save**:
One link, image or note a person captured to come back to.
_Avoid_: item, bookmark, entry

**Processing run**:
One attempt to read and understand a save, ending ready or failed.
_Avoid_: job

**Reading**:
What Shelvr itself extracts from a save without third-party AI, such as a page's title, description and recipe, or a note's first line.
_Avoid_: facts, source data

**Classification**:
The AI model's judgment about a save, made on top of its reading and only with AI consent.
_Avoid_: AI output, model answer

**AI consent**:
A person's answer to third-party AI processing of their saves: granted, declined, or not yet answered.
_Avoid_: AI opt-in, AI setting

**Settlement**:
The one decision that turns a processing run's reading and classification into what the save shows, under the owner's AI consent at that moment. A retry or refresh settles the save again.
_Avoid_: finalization

**Onboarding progress**:
Where a person is in onboarding before they finish it: the current step, their answers, and which steps they have viewed and completed. It survives a relaunch and ends when they finish onboarding or sign in to an existing account.
_Avoid_: onboarding state, onboarding session, pending onboarding

**Onboarding handoff**:
What finished onboarding leaves for the account to act on later: the spaces to create, the first save to make, and the answers the paywall echoes. It ends once that work is done.
_Avoid_: pending onboarding, onboarding replay

**Pro gate**:
The one check an action that needs Pro goes through: it lets the action run, waits while access is still loading, or opens the paywall, and it turns the server's Pro refusal into the same paywall.
_Avoid_: paywall guard, save guard

**Placement**:
The name of the place in the app where a person met the paywall, such as `remove_place` or `share`. Analytics keys on it, so a placement's name never changes.
_Avoid_: paywall source, entry point

**Blocked action**:
An action the Pro gate stopped and sent to the paywall. If the same action runs with Pro at the same placement within 30 minutes, it counts as resumed.
_Avoid_: paywalled action, pending action
