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
import type * as analytics from "../analytics.js";
import type * as appleProfile from "../appleProfile.js";
import type * as auth from "../auth.js";
import type * as cancelSurvey from "../cancelSurvey.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as devFixtures from "../devFixtures.js";
import type * as feedback from "../feedback.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as legalConsent from "../legalConsent.js";
import type * as legalConsentSync from "../legalConsentSync.js";
import type * as model_accountCreated from "../model/accountCreated.js";
import type * as model_auth from "../model/auth.js";
import type * as model_cancelSurveyFields from "../model/cancelSurveyFields.js";
import type * as model_demoErrors from "../model/demoErrors.js";
import type * as model_embedding from "../model/embedding.js";
import type * as model_entitlement from "../model/entitlement.js";
import type * as model_externalUrl from "../model/externalUrl.js";
import type * as model_feedbackFields from "../model/feedbackFields.js";
import type * as model_imagePolicy from "../model/imagePolicy.js";
import type * as model_itemFields from "../model/itemFields.js";
import type * as model_legalConsent from "../model/legalConsent.js";
import type * as model_localization from "../model/localization.js";
import type * as model_log from "../model/log.js";
import type * as model_memberships from "../model/memberships.js";
import type * as model_notificationFields from "../model/notificationFields.js";
import type * as model_notificationSchedule from "../model/notificationSchedule.js";
import type * as model_paymentTelemetry from "../model/paymentTelemetry.js";
import type * as model_posthogCapture from "../model/posthogCapture.js";
import type * as model_rateLimiter from "../model/rateLimiter.js";
import type * as model_recipeMarkup from "../model/recipeMarkup.js";
import type * as model_resend from "../model/resend.js";
import type * as model_revenuecat from "../model/revenuecat.js";
import type * as model_revenuecatTransfer from "../model/revenuecatTransfer.js";
import type * as model_safeFetch from "../model/safeFetch.js";
import type * as model_saveErrors from "../model/saveErrors.js";
import type * as model_saveSource from "../model/saveSource.js";
import type * as model_secureCompare from "../model/secureCompare.js";
import type * as model_spaceName from "../model/spaceName.js";
import type * as model_storage from "../model/storage.js";
import type * as model_storedImage from "../model/storedImage.js";
import type * as notificationDelivery from "../notificationDelivery.js";
import type * as notifications from "../notifications.js";
import type * as paymentTelemetry from "../paymentTelemetry.js";
import type * as spaces from "../spaces.js";
import type * as subscriptions from "../subscriptions.js";
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
  analytics: typeof analytics;
  appleProfile: typeof appleProfile;
  auth: typeof auth;
  cancelSurvey: typeof cancelSurvey;
  crons: typeof crons;
  demo: typeof demo;
  devFixtures: typeof devFixtures;
  feedback: typeof feedback;
  health: typeof health;
  http: typeof http;
  items: typeof items;
  legalConsent: typeof legalConsent;
  legalConsentSync: typeof legalConsentSync;
  "model/accountCreated": typeof model_accountCreated;
  "model/auth": typeof model_auth;
  "model/cancelSurveyFields": typeof model_cancelSurveyFields;
  "model/demoErrors": typeof model_demoErrors;
  "model/embedding": typeof model_embedding;
  "model/entitlement": typeof model_entitlement;
  "model/externalUrl": typeof model_externalUrl;
  "model/feedbackFields": typeof model_feedbackFields;
  "model/imagePolicy": typeof model_imagePolicy;
  "model/itemFields": typeof model_itemFields;
  "model/legalConsent": typeof model_legalConsent;
  "model/localization": typeof model_localization;
  "model/log": typeof model_log;
  "model/memberships": typeof model_memberships;
  "model/notificationFields": typeof model_notificationFields;
  "model/notificationSchedule": typeof model_notificationSchedule;
  "model/paymentTelemetry": typeof model_paymentTelemetry;
  "model/posthogCapture": typeof model_posthogCapture;
  "model/rateLimiter": typeof model_rateLimiter;
  "model/recipeMarkup": typeof model_recipeMarkup;
  "model/resend": typeof model_resend;
  "model/revenuecat": typeof model_revenuecat;
  "model/revenuecatTransfer": typeof model_revenuecatTransfer;
  "model/safeFetch": typeof model_safeFetch;
  "model/saveErrors": typeof model_saveErrors;
  "model/saveSource": typeof model_saveSource;
  "model/secureCompare": typeof model_secureCompare;
  "model/spaceName": typeof model_spaceName;
  "model/storage": typeof model_storage;
  "model/storedImage": typeof model_storedImage;
  notificationDelivery: typeof notificationDelivery;
  notifications: typeof notifications;
  paymentTelemetry: typeof paymentTelemetry;
  spaces: typeof spaces;
  subscriptions: typeof subscriptions;
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
