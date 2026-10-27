/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountTelemetry from "../accountTelemetry.js";
import type * as ai from "../ai.js";
import type * as aiConsent from "../aiConsent.js";
import type * as aiEmbeddingSweep from "../aiEmbeddingSweep.js";
import type * as aiRecommendForSpace from "../aiRecommendForSpace.js";
import type * as analytics from "../analytics.js";
import type * as appIntents from "../appIntents.js";
import type * as appleProfile from "../appleProfile.js";
import type * as appleRevoke from "../appleRevoke.js";
import type * as auth from "../auth.js";
import type * as cancelSurvey from "../cancelSurvey.js";
import type * as crons from "../crons.js";
import type * as datePlanData from "../datePlanData.js";
import type * as datePlans from "../datePlans.js";
import type * as demo from "../demo.js";
import type * as devFixtures from "../devFixtures.js";
import type * as feedback from "../feedback.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as legalConsent from "../legalConsent.js";
import type * as legalConsentSync from "../legalConsentSync.js";
import type * as mapPlaces from "../mapPlaces.js";
import type * as model_accountCreated from "../model/accountCreated.js";
import type * as model_aiConsent from "../model/aiConsent.js";
import type * as model_aiProvider from "../model/aiProvider.js";
import type * as model_appleClient from "../model/appleClient.js";
import type * as model_appleIdToken from "../model/appleIdToken.js";
import type * as model_appleJws from "../model/appleJws.js";
import type * as model_appleMaps from "../model/appleMaps.js";
import type * as model_appleSigning from "../model/appleSigning.js";
import type * as model_appleTokens from "../model/appleTokens.js";
import type * as model_auth from "../model/auth.js";
import type * as model_cancelSurveyFields from "../model/cancelSurveyFields.js";
import type * as model_captureRequest from "../model/captureRequest.js";
import type * as model_captureTokens from "../model/captureTokens.js";
import type * as model_clientIp from "../model/clientIp.js";
import type * as model_datePlan from "../model/datePlan.js";
import type * as model_dateRank from "../model/dateRank.js";
import type * as model_demoErrors from "../model/demoErrors.js";
import type * as model_deployment from "../model/deployment.js";
import type * as model_embedding from "../model/embedding.js";
import type * as model_entitlement from "../model/entitlement.js";
import type * as model_externalUrl from "../model/externalUrl.js";
import type * as model_fakeAi from "../model/fakeAi.js";
import type * as model_feedbackFields from "../model/feedbackFields.js";
import type * as model_imagePolicy from "../model/imagePolicy.js";
import type * as model_imageSize from "../model/imageSize.js";
import type * as model_itemFields from "../model/itemFields.js";
import type * as model_legalConsent from "../model/legalConsent.js";
import type * as model_localization from "../model/localization.js";
import type * as model_log from "../model/log.js";
import type * as model_memberships from "../model/memberships.js";
import type * as model_nextUp from "../model/nextUp.js";
import type * as model_notificationFields from "../model/notificationFields.js";
import type * as model_notificationSchedule from "../model/notificationSchedule.js";
import type * as model_oracle from "../model/oracle.js";
import type * as model_pageRead from "../model/pageRead.js";
import type * as model_pageReadCore from "../model/pageReadCore.js";
import type * as model_paymentTelemetry from "../model/paymentTelemetry.js";
import type * as model_placeKinds from "../model/placeKinds.js";
import type * as model_placeList from "../model/placeList.js";
import type * as model_placeVisits from "../model/placeVisits.js";
import type * as model_plan from "../model/plan.js";
import type * as model_planVote from "../model/planVote.js";
import type * as model_posthogCapture from "../model/posthogCapture.js";
import type * as model_publicFunctions from "../model/publicFunctions.js";
import type * as model_rateLimiter from "../model/rateLimiter.js";
import type * as model_readBudget from "../model/readBudget.js";
import type * as model_readers_googleMaps from "../model/readers/googleMaps.js";
import type * as model_readers_instagram from "../model/readers/instagram.js";
import type * as model_readers_pinterest from "../model/readers/pinterest.js";
import type * as model_readers_tiktok from "../model/readers/tiktok.js";
import type * as model_readers_x from "../model/readers/x.js";
import type * as model_readers_youtube from "../model/readers/youtube.js";
import type * as model_recallAge from "../model/recallAge.js";
import type * as model_recipeMarkup from "../model/recipeMarkup.js";
import type * as model_reelPlaces from "../model/reelPlaces.js";
import type * as model_resend from "../model/resend.js";
import type * as model_retentionMessaging from "../model/retentionMessaging.js";
import type * as model_revenuecat from "../model/revenuecat.js";
import type * as model_revenuecatReconcile from "../model/revenuecatReconcile.js";
import type * as model_safeFetch from "../model/safeFetch.js";
import type * as model_saveErrors from "../model/saveErrors.js";
import type * as model_saveReminders from "../model/saveReminders.js";
import type * as model_saveSource from "../model/saveSource.js";
import type * as model_searchText from "../model/searchText.js";
import type * as model_secureCompare from "../model/secureCompare.js";
import type * as model_settlement from "../model/settlement.js";
import type * as model_similarity from "../model/similarity.js";
import type * as model_spaceName from "../model/spaceName.js";
import type * as model_storage from "../model/storage.js";
import type * as model_storedImage from "../model/storedImage.js";
import type * as model_trip from "../model/trip.js";
import type * as model_tripPlan from "../model/tripPlan.js";
import type * as model_tripSuggest from "../model/tripSuggest.js";
import type * as model_videoTranscript from "../model/videoTranscript.js";
import type * as model_weeklyShelf from "../model/weeklyShelf.js";
import type * as notificationDelivery from "../notificationDelivery.js";
import type * as notifications from "../notifications.js";
import type * as oracle from "../oracle.js";
import type * as oracleLimits from "../oracleLimits.js";
import type * as paymentTelemetry from "../paymentTelemetry.js";
import type * as placePins from "../placePins.js";
import type * as placeVisits from "../placeVisits.js";
import type * as planShares from "../planShares.js";
import type * as plans from "../plans.js";
import type * as reelPlaces from "../reelPlaces.js";
import type * as spaces from "../spaces.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tripData from "../tripData.js";
import type * as tripPlanner from "../tripPlanner.js";
import type * as tripPlannerData from "../tripPlannerData.js";
import type * as trips from "../trips.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountTelemetry: typeof accountTelemetry;
  ai: typeof ai;
  aiConsent: typeof aiConsent;
  aiEmbeddingSweep: typeof aiEmbeddingSweep;
  aiRecommendForSpace: typeof aiRecommendForSpace;
  analytics: typeof analytics;
  appIntents: typeof appIntents;
  appleProfile: typeof appleProfile;
  appleRevoke: typeof appleRevoke;
  auth: typeof auth;
  cancelSurvey: typeof cancelSurvey;
  crons: typeof crons;
  datePlanData: typeof datePlanData;
  datePlans: typeof datePlans;
  demo: typeof demo;
  devFixtures: typeof devFixtures;
  feedback: typeof feedback;
  health: typeof health;
  http: typeof http;
  items: typeof items;
  legalConsent: typeof legalConsent;
  legalConsentSync: typeof legalConsentSync;
  mapPlaces: typeof mapPlaces;
  "model/accountCreated": typeof model_accountCreated;
  "model/aiConsent": typeof model_aiConsent;
  "model/aiProvider": typeof model_aiProvider;
  "model/appleClient": typeof model_appleClient;
  "model/appleIdToken": typeof model_appleIdToken;
  "model/appleJws": typeof model_appleJws;
  "model/appleMaps": typeof model_appleMaps;
  "model/appleSigning": typeof model_appleSigning;
  "model/appleTokens": typeof model_appleTokens;
  "model/auth": typeof model_auth;
  "model/cancelSurveyFields": typeof model_cancelSurveyFields;
  "model/captureRequest": typeof model_captureRequest;
  "model/captureTokens": typeof model_captureTokens;
  "model/clientIp": typeof model_clientIp;
  "model/datePlan": typeof model_datePlan;
  "model/dateRank": typeof model_dateRank;
  "model/demoErrors": typeof model_demoErrors;
  "model/deployment": typeof model_deployment;
  "model/embedding": typeof model_embedding;
  "model/entitlement": typeof model_entitlement;
  "model/externalUrl": typeof model_externalUrl;
  "model/fakeAi": typeof model_fakeAi;
  "model/feedbackFields": typeof model_feedbackFields;
  "model/imagePolicy": typeof model_imagePolicy;
  "model/imageSize": typeof model_imageSize;
  "model/itemFields": typeof model_itemFields;
  "model/legalConsent": typeof model_legalConsent;
  "model/localization": typeof model_localization;
  "model/log": typeof model_log;
  "model/memberships": typeof model_memberships;
  "model/nextUp": typeof model_nextUp;
  "model/notificationFields": typeof model_notificationFields;
  "model/notificationSchedule": typeof model_notificationSchedule;
  "model/oracle": typeof model_oracle;
  "model/pageRead": typeof model_pageRead;
  "model/pageReadCore": typeof model_pageReadCore;
  "model/paymentTelemetry": typeof model_paymentTelemetry;
  "model/placeKinds": typeof model_placeKinds;
  "model/placeList": typeof model_placeList;
  "model/placeVisits": typeof model_placeVisits;
  "model/plan": typeof model_plan;
  "model/planVote": typeof model_planVote;
  "model/posthogCapture": typeof model_posthogCapture;
  "model/publicFunctions": typeof model_publicFunctions;
  "model/rateLimiter": typeof model_rateLimiter;
  "model/readBudget": typeof model_readBudget;
  "model/readers/googleMaps": typeof model_readers_googleMaps;
  "model/readers/instagram": typeof model_readers_instagram;
  "model/readers/pinterest": typeof model_readers_pinterest;
  "model/readers/tiktok": typeof model_readers_tiktok;
  "model/readers/x": typeof model_readers_x;
  "model/readers/youtube": typeof model_readers_youtube;
  "model/recallAge": typeof model_recallAge;
  "model/recipeMarkup": typeof model_recipeMarkup;
  "model/reelPlaces": typeof model_reelPlaces;
  "model/resend": typeof model_resend;
  "model/retentionMessaging": typeof model_retentionMessaging;
  "model/revenuecat": typeof model_revenuecat;
  "model/revenuecatReconcile": typeof model_revenuecatReconcile;
  "model/safeFetch": typeof model_safeFetch;
  "model/saveErrors": typeof model_saveErrors;
  "model/saveReminders": typeof model_saveReminders;
  "model/saveSource": typeof model_saveSource;
  "model/searchText": typeof model_searchText;
  "model/secureCompare": typeof model_secureCompare;
  "model/settlement": typeof model_settlement;
  "model/similarity": typeof model_similarity;
  "model/spaceName": typeof model_spaceName;
  "model/storage": typeof model_storage;
  "model/storedImage": typeof model_storedImage;
  "model/trip": typeof model_trip;
  "model/tripPlan": typeof model_tripPlan;
  "model/tripSuggest": typeof model_tripSuggest;
  "model/videoTranscript": typeof model_videoTranscript;
  "model/weeklyShelf": typeof model_weeklyShelf;
  notificationDelivery: typeof notificationDelivery;
  notifications: typeof notifications;
  oracle: typeof oracle;
  oracleLimits: typeof oracleLimits;
  paymentTelemetry: typeof paymentTelemetry;
  placePins: typeof placePins;
  placeVisits: typeof placeVisits;
  planShares: typeof planShares;
  plans: typeof plans;
  reelPlaces: typeof reelPlaces;
  spaces: typeof spaces;
  subscriptions: typeof subscriptions;
  tripData: typeof tripData;
  tripPlanner: typeof tripPlanner;
  tripPlannerData: typeof tripPlannerData;
  trips: typeof trips;
  users: typeof users;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
