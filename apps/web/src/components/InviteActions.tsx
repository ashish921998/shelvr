"use client";

import AppStoreButton from "@/components/AppStoreButton";
import { APP_LINK_ORIGIN } from "@/lib/appLinkOrigin";

function inviteLink(token: string) {
  return `${APP_LINK_ORIGIN}/l/${encodeURIComponent(token)}`;
}

function copyInvite(token: string) {
  const link = inviteLink(token);
  const asText = () => navigator.clipboard?.writeText(link).catch(() => {});
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return void asText();
  }
  const item = new ClipboardItem({
    "text/plain": new Blob([link], { type: "text/plain" }),
    "text/uri-list": new Blob([link], { type: "text/uri-list" }),
  });
  navigator.clipboard.write([item]).catch(asText);
}

export default function InviteActions({ token }: { token: string }) {
  return (
    <>
      <div className="mt-6" onClickCapture={() => copyInvite(token)}>
        <AppStoreButton source="share" compact />
      </div>
      <p className="mt-4 text-sm text-muted">
        New to Shelvr? Download it and open it, and it will offer to add you to
        this list. If it doesn&apos;t, tap your invite link again.
      </p>
      <p className="mt-2 text-sm text-muted">
        Already have Shelvr?{" "}
        <a
          href={`shelvr://list-invite/${encodeURIComponent(token)}`}
          onClick={() => copyInvite(token)}
          className="font-semibold text-ink underline decoration-line-strong underline-offset-4"
        >
          Open it
        </a>
      </p>
    </>
  );
}
