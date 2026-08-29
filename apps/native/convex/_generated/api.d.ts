/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as appleProfile from "../appleProfile.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as model_auth from "../model/auth.js";
import type * as model_entitlement from "../model/entitlement.js";
import type * as model_externalUrl from "../model/externalUrl.js";
import type * as model_itemCreation from "../model/itemCreation.js";
import type * as model_itemEnrichment from "../model/itemEnrichment.js";
import type * as model_itemFields from "../model/itemFields.js";
import type * as model_itemImports from "../model/itemImports.js";
import type * as model_itemOperations from "../model/itemOperations.js";
import type * as model_itemReadModel from "../model/itemReadModel.js";
import type * as model_itemSuggestions from "../model/itemSuggestions.js";
import type * as model_memberships from "../model/memberships.js";
import type * as model_rateLimiter from "../model/rateLimiter.js";
import type * as model_revenuecat from "../model/revenuecat.js";
import type * as model_safeFetch from "../model/safeFetch.js";
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
  ai: typeof ai;
  appleProfile: typeof appleProfile;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  items: typeof items;
  "model/auth": typeof model_auth;
  "model/entitlement": typeof model_entitlement;
  "model/externalUrl": typeof model_externalUrl;
  "model/itemCreation": typeof model_itemCreation;
  "model/itemEnrichment": typeof model_itemEnrichment;
  "model/itemFields": typeof model_itemFields;
  "model/itemImports": typeof model_itemImports;
  "model/itemOperations": typeof model_itemOperations;
  "model/itemReadModel": typeof model_itemReadModel;
  "model/itemSuggestions": typeof model_itemSuggestions;
  "model/memberships": typeof model_memberships;
  "model/rateLimiter": typeof model_rateLimiter;
  "model/revenuecat": typeof model_revenuecat;
  "model/safeFetch": typeof model_safeFetch;
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
