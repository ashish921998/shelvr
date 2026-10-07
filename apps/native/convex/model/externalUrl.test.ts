import { describe, expect, it } from "vitest";

import {
  instagramMedia,
  isInstagramUrl,
  isPinterestHost,
  isPinterestShortUrl,
  linkSource,
  pinterestPinId,
  isTikTokUrl,
  shortFormSource,
  isUrlPolicyError,
  MAX_URL_LENGTH,
  normalizeExternalUrl,
  xStatusId,
} from "./externalUrl";

/** Assert the policy code thrown by normalizeExternalUrl for a given input. */
function expectCode(raw: string, code: string): void {
  expect(() => normalizeExternalUrl(raw)).toThrow();
  try {
    normalizeExternalUrl(raw);
  } catch (e) {
    expect(isUrlPolicyError(e) ? e.code : "not_a_policy_error").toBe(code);
  }
}

describe("normalizeExternalUrl - scheme handling", () => {
  it("prepends https:// when no scheme is present", () => {
    expect(normalizeExternalUrl("example.com")).toBe("https://example.com/");
    expect(normalizeExternalUrl("  example.com/path  ")).toBe(
      "https://example.com/path",
    );
  });

  it("keeps an existing http(s) scheme unchanged in form", () => {
    expect(normalizeExternalUrl("http://example.com")).toBe(
      "http://example.com/",
    );
    expect(normalizeExternalUrl("https://example.com")).toBe(
      "https://example.com/",
    );
  });

  it("rejects non-http schemes, including single-colon schemes", () => {
    expectCode("file:///etc/passwd", "unsupported_scheme");
    expectCode("gopher://example.com", "unsupported_scheme");
    expectCode("data:text/html,<x>", "unsupported_scheme");
    expectCode("javascript:alert(1)", "unsupported_scheme");
    expectCode("ftp://example.com", "unsupported_scheme");
    // WHATWG URL parses "example.com:8080" with scheme "example.com:"; the
    // scheme-aware detector rejects it as unsupported rather than treating it
    // as a bare host with a port.
    expectCode("example.com:8080", "unsupported_scheme");
    expectCode("localhost:3000", "unsupported_scheme");
  });

  it("does not treat a scheme-like substring mid-string as a scheme", () => {
    // No leading scheme -> https:// is prepended; the inner "://" is just path.
    expect(normalizeExternalUrl("example.com/http://evil.com")).toBe(
      "https://example.com/http://evil.com",
    );
  });
});

describe("normalizeExternalUrl - credentials", () => {
  it("rejects embedded username", () => {
    expectCode("https://user@example.com", "credentials_not_allowed");
    expectCode("https://user:pass@example.com", "credentials_not_allowed");
  });
  it("rejects embedded password without username", () => {
    expectCode("https://:pass@example.com", "credentials_not_allowed");
  });
});

describe("normalizeExternalUrl - host", () => {
  it("rejects a missing host", () => {
    // "https://" declares an http(s) scheme but has no host — reported as
    // invalid_host, distinct from genuinely unparseable input.
    expectCode("https://", "invalid_host");
  });
  it("accepts fragments and query strings", () => {
    expect(normalizeExternalUrl("https://example.com/a?b=c#frag")).toBe(
      "https://example.com/a?b=c#frag",
    );
  });
});

describe("normalizeExternalUrl - ports", () => {
  it("accepts and normalizes explicit default ports", () => {
    expect(normalizeExternalUrl("http://example.com:80")).toBe(
      "http://example.com/",
    );
    expect(normalizeExternalUrl("https://example.com:443")).toBe(
      "https://example.com/",
    );
  });
  it("rejects non-default ports", () => {
    expectCode("https://example.com:8080", "invalid_port");
    expectCode("http://example.com:8443", "invalid_port");
    expectCode("https://example.com:1", "invalid_port");
  });
});

describe("normalizeExternalUrl - IPv4 canonicalization", () => {
  it("canonicalizes decimal IPv4", () => {
    // 167903424 decimal -> 10.2.0.192 per the WHATWG host parser.
    expect(normalizeExternalUrl("https://167903424")).toBe(
      "https://10.2.0.192/",
    );
  });
  it("canonicalizes hex IPv4", () => {
    // 0x0a.0x02.0x03.0x04 == 10.2.3.4
    expect(normalizeExternalUrl("https://0x0a020304")).toBe(
      "https://10.2.3.4/",
    );
  });
  it("canonicalizes short/legacy IPv4 forms", () => {
    // 10 -> 0.0.0.10
    expect(normalizeExternalUrl("https://10")).toBe("https://0.0.0.10/");
    // 10.2 -> 10.0.0.2
    expect(normalizeExternalUrl("https://10.2")).toBe("https://10.0.0.2/");
  });
});

describe("normalizeExternalUrl - IPv6", () => {
  it("accepts IPv6 literals", () => {
    expect(normalizeExternalUrl("https://[::1]")).toBe("https://[::1]/");
    expect(normalizeExternalUrl("https://[2001:4860:4860::8888]")).toBe(
      "https://[2001:4860:4860::8888]/",
    );
  });
});

describe("normalizeExternalUrl - length boundary", () => {
  it("rejects URLs longer than the cap", () => {
    // Build a URL whose canonical form is exactly MAX+1 code units.
    const host = "example.com";
    const base = `https://${host}/`;
    const pad = MAX_URL_LENGTH - base.length + 1;
    const raw = base + "a".repeat(pad);
    expect(raw.length).toBe(MAX_URL_LENGTH + 1);
    expectCode(raw, "url_too_long");
  });
  it("accepts URLs exactly at the cap", () => {
    const host = "example.com";
    const base = `https://${host}/`;
    const pad = MAX_URL_LENGTH - base.length;
    const raw = base + "a".repeat(pad);
    expect(raw.length).toBe(MAX_URL_LENGTH);
    expect(normalizeExternalUrl(raw).length).toBe(MAX_URL_LENGTH);
  });
});

describe("normalizeExternalUrl - empty / invalid", () => {
  it("rejects empty and whitespace-only input", () => {
    expectCode("", "empty");
    expectCode("   ", "empty");
  });
  it("rejects malformed input", () => {
    // An http(s)-schemed input that fails to parse is reported as invalid_host
    // (the scheme was recognized but the URL is incomplete).
    expectCode("https://exa mple.com", "invalid_host");
    // Genuinely unparseable schemeless garbage is invalid_url.
    expectCode("exa mple", "invalid_url");
  });
});

describe("isTikTokUrl", () => {
  it("matches tiktok.com and its subdomains, including short hosts", () => {
    expect(
      isTikTokUrl("https://www.tiktok.com/@nasa/video/7301234567890123456"),
    ).toBe(true);
    expect(isTikTokUrl("https://vm.tiktok.com/ZMabc123/")).toBe(true);
    expect(isTikTokUrl("https://tiktok.com/t/ZTabc/")).toBe(true);
  });

  it("rejects look-alike hosts, other sites, and bad input", () => {
    expect(isTikTokUrl("https://nottiktok.com/x")).toBe(false);
    expect(isTikTokUrl("https://tiktok.com.evil.example/x")).toBe(false);
    expect(isTikTokUrl("https://example.com")).toBe(false);
    expect(isTikTokUrl("not a url")).toBe(false);
    expect(isTikTokUrl(undefined)).toBe(false);
  });
});

describe("xStatusId", () => {
  it("reads the post id from x.com, twitter.com, and subdomain post URLs", () => {
    expect(xStatusId("https://x.com/nasa/status/1747678091936260416")).toBe(
      "1747678091936260416",
    );
    expect(
      xStatusId("https://twitter.com/nasa/status/1747678091936260416?s=20"),
    ).toBe("1747678091936260416");
    expect(
      xStatusId("https://mobile.twitter.com/nasa/status/1747678091936260416"),
    ).toBe("1747678091936260416");
  });

  it("reads the archive bookmark shape x.com/i/web/status/{id}", () => {
    expect(xStatusId("https://x.com/i/web/status/1747678091936260416")).toBe(
      "1747678091936260416",
    );
  });

  it("accepts trailing segments but rejects ids with trailing garbage", () => {
    expect(
      xStatusId("https://x.com/nasa/status/1747678091936260416/photo/1"),
    ).toBe("1747678091936260416");
    expect(xStatusId("https://x.com/nasa/status/123abc")).toBeUndefined();
    expect(xStatusId("https://x.com/nasa/status/abc123")).toBeUndefined();
  });

  it("rejects profiles, lists, articles, short links, look-alike hosts, and bad input", () => {
    expect(xStatusId("https://x.com/nasa")).toBeUndefined();
    expect(xStatusId("https://x.com/i/lists/12345")).toBeUndefined();
    expect(
      xStatusId("https://x.com/i/article/2097060822207909888"),
    ).toBeUndefined();
    expect(xStatusId("https://x.com/nasa/status")).toBeUndefined();
    expect(xStatusId("https://t.co/abc123")).toBeUndefined();
    expect(
      xStatusId("https://x.com.evil.example/nasa/status/123"),
    ).toBeUndefined();
    expect(xStatusId("not a url")).toBeUndefined();
    expect(xStatusId(undefined)).toBeUndefined();
  });
});

describe("instagramMedia", () => {
  it.each([
    ["https://www.instagram.com/reel/DHVrPLrIyQ_/", "reel"],
    ["https://instagram.com/reel/DHVrPLrIyQ_/?igsh=MWQ1ZGUxMzBkMA==", "reel"],
    ["https://m.instagram.com/reels/DHVrPLrIyQ_/", "reel"],
    ["https://www.instagram.com/natgeo/reel/DHVrPLrIyQ_/", "reel"],
    ["https://www.instagram.com/p/DHVrPLrIyQ_/?img_index=2", "p"],
    ["https://instagr.am/p/DHVrPLrIyQ_/", "p"],
    ["https://www.instagram.com/tv/DHVrPLrIyQ_", "tv"],
  ])("reads %s as a %s", (url, kind) => {
    expect(instagramMedia(url)).toEqual({ kind, shortcode: "DHVrPLrIyQ_" });
  });

  it.each([
    ["https://www.instagram.com/share/reel/BAbc123xyz/", "reel"],
    ["https://www.instagram.com/share/p/BAbc123xyz", "p"],
  ])("reads the share link %s as a %s with no shortcode", (url, kind) => {
    expect(instagramMedia(url)).toEqual({ kind });
    expect(isInstagramUrl(url)).toBe(true);
  });

  it("rejects profiles, sound pages, look-alike hosts, and bad input", () => {
    expect(isInstagramUrl("https://www.instagram.com/natgeo/")).toBe(false);
    expect(isInstagramUrl("https://www.instagram.com/reels/audio/123/")).toBe(
      false,
    );
    expect(isInstagramUrl("https://www.instagram.com/stories/natgeo/1/")).toBe(
      false,
    );
    expect(isInstagramUrl("https://instagram.com.evil.example/p/abc/")).toBe(
      false,
    );
    expect(isInstagramUrl("https://notinstagram.com/p/abc/")).toBe(false);
    expect(isInstagramUrl("not a url")).toBe(false);
    expect(isInstagramUrl(undefined)).toBe(false);
  });
});

describe("shortFormSource", () => {
  it("names the site and whether the link is a video", () => {
    expect(shortFormSource("https://vm.tiktok.com/ZMabc123/")).toEqual({
      site: "TikTok",
      video: true,
    });
    expect(
      shortFormSource("https://www.instagram.com/reel/DHVrPLrIyQ_/"),
    ).toEqual({ site: "Instagram", video: true });
    expect(shortFormSource("https://www.instagram.com/p/DHVrPLrIyQ_/")).toEqual(
      { site: "Instagram", video: false },
    );
    expect(shortFormSource("https://example.com/reel/abc/")).toBeUndefined();
  });
});

describe("pinterestPinId", () => {
  it("reads the id from bare, slugged, country, and shared pin URLs", () => {
    expect(
      pinterestPinId("https://www.pinterest.com/pin/33777065951313270/"),
    ).toBe("33777065951313270");
    expect(
      pinterestPinId(
        "https://www.pinterest.com/pin/25-easy-chicken-recipes-for-quick-healthy-dinners--643944446743403202/",
      ),
    ).toBe("643944446743403202");
    expect(
      pinterestPinId("https://in.pinterest.com/pin/760756562077599386"),
    ).toBe("760756562077599386");
    expect(
      pinterestPinId("https://www.pinterest.co.uk/pin/760756562077599386/"),
    ).toBe("760756562077599386");
    expect(
      pinterestPinId(
        "https://www.pinterest.com/pin/760756562077599386/sent/?invite_code=x&sfo=1",
      ),
    ).toBe("760756562077599386");
  });

  it("rejects boards, profiles, bad ids, look-alike hosts, and bad input", () => {
    expect(
      pinterestPinId(
        "https://www.pinterest.com/damndelicious/easy-chicken-recipes/",
      ),
    ).toBeUndefined();
    expect(pinterestPinId("https://www.pinterest.com/pin/")).toBeUndefined();
    expect(
      pinterestPinId("https://www.pinterest.com/pin/123abc/"),
    ).toBeUndefined();
    expect(
      pinterestPinId("https://pinterest.com.evil.example/pin/123/"),
    ).toBeUndefined();
    expect(pinterestPinId("https://notpinterest.com/pin/123/")).toBeUndefined();
    expect(pinterestPinId("not a url")).toBeUndefined();
    expect(pinterestPinId(undefined)).toBeUndefined();
  });
});

describe("isPinterestShortUrl", () => {
  it("accepts pin.it only", () => {
    expect(isPinterestShortUrl("https://pin.it/4Vw0y6Zab")).toBe(true);
    expect(isPinterestShortUrl("https://pin.it.evil.example/4Vw0y6Z")).toBe(
      false,
    );
    expect(isPinterestShortUrl("https://www.pinterest.com/pin/1/")).toBe(false);
    expect(isPinterestShortUrl(undefined)).toBe(false);
  });
});

describe("isPinterestHost", () => {
  it("accepts Pinterest's domains and pin.it, and nothing else", () => {
    for (const host of [
      "pinterest.com",
      "www.pinterest.com",
      "in.pinterest.com",
      "www.pinterest.co.uk",
      "pinterest.com.au",
      "pinterest.de",
      "pin.it",
    ]) {
      expect(isPinterestHost(host)).toBe(true);
    }
    for (const host of [
      "pinterest.io",
      "pinterest.cc",
      "notpinterest.com",
      "pinterest.com.evil.example",
      "example.com",
    ]) {
      expect(isPinterestHost(host)).toBe(false);
    }
  });
});

describe("linkSource", () => {
  it("names the platform reader for each kind of link", () => {
    expect(linkSource("https://www.tiktok.com/@a/video/1")).toBe("tiktok");
    expect(linkSource("https://x.com/nasa/status/1")).toBe("x");
    expect(linkSource("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(linkSource("https://www.pinterest.com/pin/1/")).toBe("pinterest");
    expect(linkSource("https://pin.it/abc")).toBe("pinterest");
    expect(linkSource("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(linkSource("https://youtu.be/abc")).toBe("youtube");
    expect(linkSource("https://m.youtube.com/shorts/abc")).toBe("youtube");
    expect(linkSource("https://notyoutube.com/watch?v=abc")).toBeUndefined();
    expect(
      linkSource("https://www.pinterest.com/cook/dinners/"),
    ).toBeUndefined();
    expect(linkSource("https://example.com/post")).toBeUndefined();
    expect(linkSource(undefined)).toBeUndefined();
  });
});
