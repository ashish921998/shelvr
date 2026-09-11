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
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as devFixtures from "../devFixtures.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as model_accountCreated from "../model/accountCreated.js";
import type * as model_auth from "../model/auth.js";
import type * as model_entitlement from "../model/entitlement.js";
import type * as model_externalUrl from "../model/externalUrl.js";
import type * as model_imagePolicy from "../model/imagePolicy.js";
import type * as model_itemFields from "../model/itemFields.js";
import type * as model_memberships from "../model/memberships.js";
import type * as model_notificationDelivery from "../model/notificationDelivery.js";
import type * as model_notificationSchedule from "../model/notificationSchedule.js";
import type * as model_paymentTelemetry from "../model/paymentTelemetry.js";
import type * as model_rateLimiter from "../model/rateLimiter.js";
import type * as model_revenuecat from "../model/revenuecat.js";
import type * as model_revenuecatTransfer from "../model/revenuecatTransfer.js";
import type * as model_safeFetch from "../model/safeFetch.js";
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
  crons: typeof crons;
  demo: typeof demo;
  devFixtures: typeof devFixtures;
  http: typeof http;
  items: typeof items;
  "model/accountCreated": typeof model_accountCreated;
  "model/auth": typeof model_auth;
  "model/entitlement": typeof model_entitlement;
  "model/externalUrl": typeof model_externalUrl;
  "model/imagePolicy": typeof model_imagePolicy;
  "model/itemFields": typeof model_itemFields;
  "model/memberships": typeof model_memberships;
  "model/notificationDelivery": typeof model_notificationDelivery;
  "model/notificationSchedule": typeof model_notificationSchedule;
  "model/paymentTelemetry": typeof model_paymentTelemetry;
  "model/rateLimiter": typeof model_rateLimiter;
  "model/revenuecat": typeof model_revenuecat;
  "model/revenuecatTransfer": typeof model_revenuecatTransfer;
  "model/safeFetch": typeof model_safeFetch;
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
