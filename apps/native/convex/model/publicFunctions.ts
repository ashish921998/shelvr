/**
 * The public queries and mutations that do not go through `authedQuery` or
 * `authedMutation` (`model/auth.ts`). `publicFunctions.test.ts` fails on any other one.
 *
 * `PUBLIC_ON_PURPOSE` holds the functions that must answer a caller with no live account,
 * each with one sentence on why; a reviewer checks the reason against the handler.
 * `NOT_MOVED_YET` holds the functions still opening with `await requireUserId(ctx)`; the
 * test calls each one as a signed-out caller and as a deleting account and fails unless it
 * is refused first. The list only shrinks, to empty, and is then deleted. Public actions
 * have no builder yet and are not listed.
 *
 * A key is the Convex function path: the module path relative to `convex/` without its
 * extension, a colon, and the export name, as in `cancelSurvey:getStatus`.
 * `.github/CODEOWNERS` names the owner for this file.
 */

export const PUBLIC_ON_PURPOSE: Readonly<Record<string, string>> = {
  "auth:isAuthenticated":
    "Convex Auth's own query answers false to a signed-out caller, which is how the client learns it is signed out.",
  "devFixtures:canResetCurrentUser":
    "Answers false, not an error, to a signed-out caller or a non-development account, so the dev-only reset button can hide.",
  "users:deleteCurrentUserAccount":
    "Resumes the cleanup for an account already marked deleting, which requireUserId would refuse.",
  "users:getCurrentUser":
    "Returns null to a signed-out caller or an account already marked deleting, so the client can show signed-out state and stop syncing identity.",
};

export const NOT_MOVED_YET: readonly string[] = [
  "aiConsent:getStatus",
  "aiConsent:setConsent",
  "appIntents:revokeCaptureToken",
  "demo:createDemoItem",
  "demo:retryDemoItem",
  "devFixtures:resetCurrentUser",
  "feedback:submitFeedback",
  "items:attachImageUpload",
  "items:beginImageImport",
  "items:createLinkItem",
  "items:createNoteItem",
  "items:createShareLink",
  "items:deleteItem",
  "items:finalizeImageImport",
  "items:findLinks",
  "items:getImportOperation",
  "items:getItem",
  "items:importLinks",
  "items:listItems",
  "items:listItemsPage",
  "items:listLocatedItems",
  "items:listRecentItems",
  "items:nextUp",
  "items:photoUsage",
  "items:reprocessItem",
  "items:saveProgress",
  "items:searchItems",
  "items:settleShareLink",
  "items:similarItems",
  "items:updateNoteItem",
  "legalConsent:get",
  "legalConsent:review",
  "legalConsent:withdraw",
  "notifications:getDigest",
  "notifications:getPreferences",
  "notifications:markDigestOpened",
  "notifications:markItemOpened",
  "notifications:registerDevice",
  "notifications:setPreferences",
  "notifications:setSaveReminders",
  "notifications:unregisterDevice",
  "planShares:createPlanShare",
  "planShares:latestPlanShare",
  "spaces:acceptAllSuggestions",
  "spaces:acceptSuggestion",
  "spaces:addItemToSpace",
  "spaces:createSpace",
  "spaces:deleteSpace",
  "spaces:dismissSuggestion",
  "spaces:getSpace",
  "spaces:listSpaces",
  "spaces:removeItemFromSpace",
  "spaces:undoAcceptSuggestion",
  "spaces:updateSpace",
  "subscriptions:getEntitlement",
  "tripData:getSpaceTrip",
  "tripData:swapTripStop",
  "tripData:tripCities",
];
