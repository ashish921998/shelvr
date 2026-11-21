/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as campaigns from "../campaigns.js";
import type * as comments from "../comments.js";
import type * as http from "../http.js";
import type * as media from "../media.js";
import type * as model_access from "../model/access.js";
import type * as model_muxEvent from "../model/muxEvent.js";
import type * as model_muxKey from "../model/muxKey.js";
import type * as model_muxSignature from "../model/muxSignature.js";
import type * as model_rules from "../model/rules.js";
import type * as videos from "../videos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  campaigns: typeof campaigns;
  comments: typeof comments;
  http: typeof http;
  media: typeof media;
  "model/access": typeof model_access;
  "model/muxEvent": typeof model_muxEvent;
  "model/muxKey": typeof model_muxKey;
  "model/muxSignature": typeof model_muxSignature;
  "model/rules": typeof model_rules;
  videos: typeof videos;
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

export declare const components: {};
