import { describe, expect, it } from "vitest";

import { normalizeAppleProfile } from "./appleProfile";

describe("normalizeAppleProfile", () => {
  it("omits Auth.js' null image while retaining Apple's identity fields", () => {
    const normalized = normalizeAppleProfile({
      iss: "https://appleid.apple.com",
      aud: "com.shelvr.save",
      iat: 1,
      exp: 2,
      sub: "apple-user-1",
      nonce: "nonce",
      nonce_supported: true,
      email: "reviewer@example.com",
      email_verified: true,
      is_private_email: false,
      real_user_status: 2,
      transfer_sub: "",
      at_hash: "hash",
      auth_time: 1,
      user: {
        name: { firstName: "App", lastName: "Reviewer" },
        email: "reviewer@example.com",
      },
    });

    expect(normalized).toEqual({
      id: "apple-user-1",
      name: "App Reviewer",
      email: "reviewer@example.com",
    });
    expect(normalized).not.toHaveProperty("image");
  });
});
