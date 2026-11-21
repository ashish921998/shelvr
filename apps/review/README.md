# Shelvr Review

Invite-only video review for campaign creators: everyone in a campaign uploads
into one shared space, admins and creators leave comments pinned to moments in
the video, admins record screen + camera walkthroughs as feedback, and each
video carries a status (needs review, changes requested, approved) across
versions.

It is a separate Next.js app with its **own Convex project**. It shares no
tables, users or functions with the Shelvr app backend in `apps/native/convex`.

## Pieces

| Piece         | Where                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Schema        | `convex/schema.ts` (campaigns, members, invites, videos, versions, media, comments)                                                   |
| Access rules  | `convex/model/access.ts`, `convex/model/rules.ts`                                                                                     |
| Sign-in       | `convex/auth.ts`: Convex Auth magic links through Resend; only staff emails or invited emails can create an account                   |
| Video hosting | `convex/media.ts`, `convex/model/storage.ts`: Cloudflare R2, presigned uploads straight from the browser and presigned playback links |
| Pages         | `src/app` → `src/components` (`CampaignView`, `VideoView`, `CommentsPanel`, `Recorder`)                                               |

## Set up

1. Create a new Convex project for this app, then from `apps/review` run
   `pnpm exec convex dev`. It writes `.env.local` with `NEXT_PUBLIC_CONVEX_URL`
   and regenerates `convex/_generated`.
2. Set up Convex Auth keys: `pnpm dlx @convex-dev/auth` (sets `JWT_PRIVATE_KEY`,
   `JWKS` and `SITE_URL`).
3. Set the Convex environment variables declared in `convex/convex.config.ts`:
   - `REVIEW_STAFF_EMAILS`: comma-separated emails that may start campaigns
   - `AUTH_RESEND_KEY`, `REVIEW_EMAIL_FROM`: magic links and invite emails
   - `SITE_URL`: e.g. `https://review.tryshelvr.app`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`:
     a private Cloudflare R2 bucket and an R2 API token with Object Read & Write
     on that bucket only
4. R2 CORS: on the bucket, allow `PUT`, `GET` and `HEAD` from the site origin
   with the `Content-Type` header, so browsers can upload and play directly:
   ```json
   [
     {
       "AllowedOrigins": ["https://review.tryshelvr.app"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Vercel: a new project with root directory `apps/review`,
   `NEXT_PUBLIC_CONVEX_URL` set, and the `review.tryshelvr.app` domain.

## Roles

- **Staff** (`REVIEW_STAFF_EMAILS`) can start campaigns and become their admin.
- **Admins** invite people, set a video's status, edit the brief, and can
  delete or resolve any comment.
- **Creators** see every video in their campaigns, upload their own videos and
  new versions, and comment on anyone's video.
