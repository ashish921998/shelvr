import { describe, expect, it } from "vitest";

import {
  defaultResolver,
  isPublicAddress,
  makeValidatingLookup,
  safeFetch,
  decodeWithContentType,
} from "./safeFetch";
import type { DnsResolver } from "./safeFetch";
import { MockAgent, type Dispatcher } from "undici";

function resolverFor(addresses: string[]): DnsResolver {
  return async () =>
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
}

describe("isPublicAddress", () => {
  it("rejects loopback", () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("127.255.255.255")).toBe(false);
  });
  it("rejects RFC1918 private ranges", () => {
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("172.16.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
  });
  it("rejects link-local", () => {
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("169.254.0.1")).toBe(false);
  });
  it("rejects multicast", () => {
    expect(isPublicAddress("224.0.0.1")).toBe(false);
  });
  it("rejects unspecified", () => {
    expect(isPublicAddress("0.0.0.0")).toBe(false);
  });
  it("rejects reserved/documentation ranges", () => {
    expect(isPublicAddress("240.0.0.1")).toBe(false);
    expect(isPublicAddress("203.0.113.1")).toBe(false);
    expect(isPublicAddress("198.51.100.1")).toBe(false);
    expect(isPublicAddress("192.0.2.1")).toBe(false);
  });
  it("rejects IPv6 loopback and link-local", () => {
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("fe80::1")).toBe(false);
  });
  it("rejects IPv4-mapped IPv6 of a private address", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
  });
  it("allows IPv4-mapped IPv6 of a public address", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });
  it("allows globally routable public addresses", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2001:4860:4860::8888")).toBe(true);
  });
  it("rejects unparseable input", () => {
    expect(isPublicAddress("not-an-ip")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

async function runLookup(
  lookup: ReturnType<typeof makeValidatingLookup>,
  hostname: string,
): Promise<{
  err: NodeJS.ErrnoException | null;
  address: string;
  family: number;
}> {
  return new Promise((resolve) => {
    lookup(hostname, {}, (err, address, family) =>
      resolve({ err, address: address as string, family: family as number }),
    );
  });
}

async function runLookupAll(
  lookup: ReturnType<typeof makeValidatingLookup>,
  hostname: string,
): Promise<{
  err: NodeJS.ErrnoException | null;
  addresses: import("node:dns").LookupAddress[] | null;
}> {
  return new Promise((resolve) => {
    lookup(hostname, { all: true }, (err, addresses) =>
      resolve({
        err,
        addresses: addresses as import("node:dns").LookupAddress[] | null,
      }),
    );
  });
}

describe("makeValidatingLookup (connection-bound DNS)", () => {
  it("blocks a private DNS answer with ECONNREFUSED before a socket opens", async () => {
    const lookup = makeValidatingLookup(resolverFor(["127.0.0.1"]));
    const { err, address } = await runLookup(lookup, "anything.test");
    expect(err).not.toBeNull();
    expect(err?.code).toBe("ECONNREFUSED");
    expect(address).toBe("");
  });

  it("blocks when DNS returns a MIXED public+private answer set", async () => {
    const lookup = makeValidatingLookup(resolverFor(["8.8.8.8", "127.0.0.1"]));
    const { err } = await runLookup(lookup, "mixed.test");
    expect(err?.code).toBe("ECONNREFUSED");
  });

  it("blocks cloud-metadata link-local addresses", async () => {
    const lookup = makeValidatingLookup(resolverFor(["169.254.169.254"]));
    const { err } = await runLookup(lookup, "metadata.test");
    expect(err?.code).toBe("ECONNREFUSED");
  });

  it("blocks an IPv4-mapped IPv6 private answer", async () => {
    const lookup = makeValidatingLookup(resolverFor(["::ffff:127.0.0.1"]));
    const { err } = await runLookup(lookup, "mapped.test");
    expect(err?.code).toBe("ECONNREFUSED");
  });

  it("returns the validated public address when ALL answers are public", async () => {
    const lookup = makeValidatingLookup(resolverFor(["8.8.8.8", "1.1.1.1"]));
    const { err, address, family } = await runLookup(lookup, "public.test");
    expect(err).toBeNull();
    expect(address).toBe("8.8.8.8");
    expect(family).toBe(4);
  });

  it("returns ENOTFOUND when the resolver gives no answers", async () => {
    const lookup = makeValidatingLookup(resolverFor([]));
    const { err } = await runLookup(lookup, "none.test");
    expect(err?.code).toBe("ENOTFOUND");
  });

  it("propagates a resolver error", async () => {
    const lookup = makeValidatingLookup(async () => {
      throw Object.assign(new Error("dns down"), { code: "ESERVFAIL" });
    });
    const { err } = await runLookup(lookup, "broken.test");
    expect(err?.code).toBe("ESERVFAIL");
  });

  it("returns the array form when called with all:true (undici's actual shape)", async () => {
    const lookup = makeValidatingLookup(resolverFor(["8.8.8.8", "1.1.1.1"]));
    const { err, addresses } = await runLookupAll(lookup, "public.test");
    expect(err).toBeNull();
    expect(addresses).toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]);
  });

  it("blocks in the all:true form too when an answer is private", async () => {
    const lookup = makeValidatingLookup(resolverFor(["8.8.8.8", "127.0.0.1"]));
    const { err, addresses } = await runLookupAll(lookup, "mixed.test");
    expect(err?.code).toBe("ECONNREFUSED");
    expect(Array.isArray(addresses)).toBe(false);
  });
});

describe("defaultResolver deadline", () => {
  it("rejects (does not hang) when the underlying lookup fails", async () => {
    await expect(
      defaultResolver("nonexistent.invalid.local.test"),
    ).rejects.toThrow();
  });
});

function mockDispatcher(): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  return agent;
}

describe("safeFetch HTTP policy", () => {
  it("returns bounded bytes on a 200", async () => {
    const agent = mockDispatcher();
    const pool = agent.get("http://example.test");
    pool.intercept({ method: "GET", path: "/" }).reply(200, "hello", {
      headers: { "content-type": "text/html" },
    });
    const result = await safeFetch("http://example.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(new TextDecoder().decode(result.bytes)).toBe("hello");
      expect(result.contentType).toContain("text/html");
    }
  });

  it("follows a public redirect chain within the hop limit", async () => {
    const agent = mockDispatcher();
    const a = agent.get("http://a.test");
    a.intercept({ method: "GET", path: "/" }).reply(302, "", {
      headers: { location: "http://b.test/" },
    });
    const b = agent.get("http://b.test");
    b.intercept({ method: "GET", path: "/" }).reply(200, "final", {
      headers: { "content-type": "text/html" },
    });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalUrl).toBe("http://b.test/");
      expect(new TextDecoder().decode(result.bytes)).toBe("final");
    }
  });

  it("resolves a relative Location against the current URL", async () => {
    const agent = mockDispatcher();
    const a = agent.get("http://a.test");
    a.intercept({ method: "GET", path: "/start" }).reply(302, "", {
      headers: { location: "/end" },
    });
    a.intercept({ method: "GET", path: "/end" }).reply(200, "x", {
      headers: { "content-type": "text/html" },
    });
    const result = await safeFetch("http://a.test/start", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finalUrl).toBe("http://a.test/end");
    }
  });

  it("rejects a non-http redirect scheme", async () => {
    const agent = mockDispatcher();
    const a = agent.get("http://a.test");
    a.intercept({ method: "GET", path: "/" }).reply(302, "", {
      headers: { location: "file:///etc/passwd" },
    });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_scheme");
    }
  });

  it("rejects a credentialed redirect target", async () => {
    const agent = mockDispatcher();
    const a = agent.get("http://a.test");
    a.intercept({ method: "GET", path: "/" }).reply(302, "", {
      headers: { location: "http://user:pass@b.test/" },
    });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("credentials_not_allowed");
    }
  });

  it("rejects on the fourth redirect (boundary: third hop allowed)", async () => {
    const agent = mockDispatcher();
    const setRedirect = (host: string, target: string) => {
      agent
        .get(host)
        .intercept({ method: "GET", path: "/" })
        .reply(302, "", {
          headers: { location: target },
        });
    };
    setRedirect("http://a.test", "http://b.test/");
    setRedirect("http://b.test", "http://c.test/");
    setRedirect("http://c.test", "http://d.test/");
    setRedirect("http://d.test", "http://e.test/");
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("redirect_limit");
    }
  });

  it("rejects an http error status", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(500, "");
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("http_error");
      expect(result.status).toBe(500);
    }
  });

  it("carries the status on an http error so callers can tell gone from blocked", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(404, "");
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("http_error");
      expect(result.status).toBe(404);
    }
  });

  it("leaves status unset for a non-http failure", async () => {
    const result = await safeFetch("http://127.0.0.1/", {
      timeoutMs: 2000,
      maxBytes: 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
      expect(result.status).toBeUndefined();
    }
  });

  it("rejects a disallowed content type", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, "binary", {
        headers: { "content-type": "application/octet-stream" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
      allowContentType: (ct) => ct.startsWith("text/"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_content_type");
    }
  });

  it("normalizes content type case-insensitively (RFC 9110)", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, "ok", { headers: { "content-type": "Text/HTML" } });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
      allowContentType: (ct) => ct.startsWith("text/html"),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a lying Content-Length over the cap", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(100), {
        headers: { "content-type": "text/html", "content-length": "100" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("response_too_large");
    }
  });

  it("rejects an oversized stream when Content-Length is missing", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(200), {
        headers: { "content-type": "text/html" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("response_too_large");
    }
  });

  it("truncates an oversized stream when onOverflow is 'truncate'", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(200), {
        headers: { "content-type": "text/html" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
      onOverflow: "truncate",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes.length).toBe(50);
      expect(result.truncated).toBe(true);
    }
  });

  it("reports a body under the cap as whole, not truncated", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(20), {
        headers: { "content-type": "text/html" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
      onOverflow: "truncate",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes.length).toBe(20);
      expect(result.truncated).toBeUndefined();
    }
  });

  it("reports a body exactly at the cap as whole", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(50), {
        headers: { "content-type": "text/html" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
      onOverflow: "truncate",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes.length).toBe(50);
      expect(result.truncated).toBeUndefined();
    }
  });

  it("truncates even when Content-Length declares more than maxBytes", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(200, Buffer.alloc(100), {
        headers: { "content-type": "text/html", "content-length": "100" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 50,
      dispatcher: agent,
      onOverflow: "truncate",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes.length).toBe(50);
      expect(result.truncated).toBe(true);
    }
  });

  it("returns timeout (not a successful truncated result) when the deadline fires while draining overflow in truncate mode", async () => {
    const slowDumpBody = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.alloc(200);
      },
      async dump() {
        await new Promise((r) => setTimeout(r, 400));
      },
    };
    const dispatcher: Dispatcher = {
      request() {
        return Promise.resolve({
          statusCode: 200,
          headers: { "content-type": "text/html" },
          body: slowDumpBody,
        } as unknown as Dispatcher.ResponseData);
      },
      dispatch() {
        return false;
      },
      close() {
        return Promise.resolve();
      },
      destroy() {
        return Promise.resolve();
      },
    } as unknown as Dispatcher;
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 100,
      maxBytes: 50,
      dispatcher,
      onOverflow: "truncate",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
    }
  });

  it("rejects a syntactically invalid url before any request", async () => {
    const agent = mockDispatcher();
    const result = await safeFetch("javascript:alert(1)", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported_scheme");
    }
  });
});

function recordingDispatcher(): {
  dispatcher: Dispatcher;
  called: () => boolean;
} {
  let called = false;
  const dispatcher = {
    request() {
      called = true;
      return Promise.reject(new Error("should not have been called"));
    },
  } as unknown as Dispatcher;
  return { dispatcher, called: () => called };
}

describe("safeFetch IP-literal SSRF block", () => {
  it("rejects loopback IP literals before dispatch", async () => {
    const rec = recordingDispatcher();
    const result = await safeFetch("http://127.0.0.1/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: rec.dispatcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
    }
    expect(rec.called()).toBe(false);
  });

  it("rejects RFC1918 private IP literals before dispatch", async () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "192.168.1.1"]) {
      const rec = recordingDispatcher();
      const result = await safeFetch(`http://${ip}/`, {
        timeoutMs: 2000,
        maxBytes: 1024,
        dispatcher: rec.dispatcher,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("blocked_destination");
      }
      expect(rec.called()).toBe(false);
    }
  });

  it("rejects cloud-metadata link-local IP literal before dispatch", async () => {
    const rec = recordingDispatcher();
    const result = await safeFetch("http://169.254.169.254/latest/meta-data/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: rec.dispatcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
    }
    expect(rec.called()).toBe(false);
  });

  it("rejects IPv6 loopback literal before dispatch (bracket stripping)", async () => {
    const rec = recordingDispatcher();
    const result = await safeFetch("http://[::1]/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: rec.dispatcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
    }
    expect(rec.called()).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 loopback literal before dispatch", async () => {
    const rec = recordingDispatcher();
    const result = await safeFetch("http://[::ffff:127.0.0.1]/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: rec.dispatcher,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
    }
    expect(rec.called()).toBe(false);
  });

  it("rejects a public URL that redirects to a private IP literal", async () => {
    const agent = mockDispatcher();
    agent
      .get("http://a.test")
      .intercept({ method: "GET", path: "/" })
      .reply(302, "", {
        headers: { location: "http://169.254.169.254/" },
      });
    const result = await safeFetch("http://a.test/", {
      timeoutMs: 2000,
      maxBytes: 1024,
      dispatcher: agent,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("blocked_destination");
    }
  });
});

describe("safeFetch timeout", () => {
  it("times out when the server never responds", async () => {
    const hangingDispatcher: Dispatcher = {
      request() {
        return new Promise(() => {});
      },
      dispatch() {
        return false;
      },
      close() {
        return Promise.resolve();
      },
      destroy() {
        return Promise.resolve();
      },
    } as unknown as Dispatcher;
    const start = Date.now();
    const result = await safeFetch("http://hang.test/", {
      timeoutMs: 300,
      maxBytes: 1024,
      dispatcher: hangingDispatcher,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(250);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
    }
  });
});

describe("secret leakage", () => {
  it("never includes a query-string API key in a blocked-fetch result code", async () => {
    const SECRET = "AKIAFAKEKEY1234567890";
    const url = `https://serpapi.com/search?q=test&api_key=${SECRET}`;
    const hangingDispatcher: Dispatcher = {
      request() {
        return new Promise(() => {});
      },
    } as unknown as Dispatcher;
    const result = await safeFetch(url, {
      timeoutMs: 200,
      maxBytes: 1024,
      dispatcher: hangingDispatcher,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
    }
  });

  it("never includes a query-string secret in a content-type rejection", async () => {
    const SECRET = "SUPERSECRETKEY";
    const agent = mockDispatcher();
    agent
      .get("https://serpapi.test")
      .intercept({ method: "GET", path: "/search" })
      .reply(200, "x", { headers: { "content-type": "text/plain" } });
    const result = await safeFetch(
      `https://serpapi.test/search?api_key=${SECRET}`,
      {
        timeoutMs: 2000,
        maxBytes: 1024,
        dispatcher: agent,
        allowContentType: (ct) => ct.includes("json"),
      },
    );
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.ok).toBe(false);
  });
});

describe("decodeWithContentType", () => {
  it("decodes as UTF-8 when no charset is declared", () => {
    const text = "héllo wörld";
    const bytes = new TextEncoder().encode(text);
    expect(decodeWithContentType(bytes, "text/html")).toBe(text);
  });

  it("decodes as UTF-8 when charset=utf-8 is declared", () => {
    const text = "héllo";
    const bytes = new TextEncoder().encode(text);
    expect(decodeWithContentType(bytes, "text/html; charset=utf-8")).toBe(text);
  });

  it("decodes ISO-8859-1 when charset is declared", () => {
    const bytes = new Uint8Array([0x68, 0xe9, 0x6c, 0x6c, 0x6f]);
    expect(decodeWithContentType(bytes, "text/html; charset=iso-8859-1")).toBe(
      "héllo",
    );
  });

  it("decodes Windows-1252 when charset is declared", () => {
    const bytes = new Uint8Array([0x73, 0x92]);
    const decoded = decodeWithContentType(
      bytes,
      "text/html; charset=windows-1252",
    );
    expect(decoded).toBe("s\u2019");
  });

  it("maps the Windows-1252 C1 range with the WHATWG table on every Node version", () => {
    const bytes = new Uint8Array([0x93, 0x68, 0x69, 0x94, 0x20, 0x80, 0x35]);
    expect(
      decodeWithContentType(bytes, "text/html; charset=windows-1252"),
    ).toBe("\u201chi\u201d \u20ac5");
    const unmapped = new Uint8Array([0x81, 0x8d, 0x8f, 0x90, 0x9d]);
    expect(
      decodeWithContentType(unmapped, "text/html; charset=windows-1252"),
    ).toBe("\u0081\u008d\u008f\u0090\u009d");
  });

  it("treats ISO-8859-1 and its aliases as Windows-1252, as browsers do", () => {
    const bytes = new Uint8Array([0x73, 0x92, 0xe9]);
    for (const label of ["iso-8859-1", "latin1", "cp1252", "ISO-8859-1"]) {
      expect(decodeWithContentType(bytes, `text/html; charset=${label}`)).toBe(
        "s\u2019\u00e9",
      );
    }
  });

  it("falls back to UTF-8 for an unsupported charset", () => {
    const bytes = new Uint8Array([0x68, 0xe9, 0x6c, 0x6c, 0x6f]);
    expect(() =>
      decodeWithContentType(bytes, "text/html; charset=fake-charset"),
    ).not.toThrow();
    expect(
      decodeWithContentType(bytes, "text/html; charset=fake-charset"),
    ).toContain("h");
  });

  it("extracts charset from quoted values", () => {
    const bytes = new Uint8Array([0xe9]);
    expect(
      decodeWithContentType(bytes, 'text/html; charset="iso-8859-1"'),
    ).toBe("é");
  });
});
