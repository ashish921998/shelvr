import { describe, expect, it } from "vitest";
import { passportMapUrl } from "./passportMap";

async function testKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  return {
    config: {
      privateKey: btoa(String.fromCharCode(...der)),
      keyId: "KEY1",
      teamId: "TEAM1",
    },
    publicKey: pair.publicKey,
  };
}

function signatureBytes(signature: string): Uint8Array<ArrayBuffer> {
  const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

describe("passportMapUrl", () => {
  it("signs the snapshot path so Apple can check it", async () => {
    const { config, publicKey } = await testKeys();
    const url = await passportMapUrl(config, [
      { lat: 38.7, lng: -9.1 },
      { lat: 41.1, lng: -8.6 },
    ]);
    const [signed, signature] = (url ?? "").split("&signature=");
    expect(signed).toMatch(/^https:\/\/snapshot\.apple-mapkit\.com\/api\//);
    const path = signed.replace("https://snapshot.apple-mapkit.com", "");
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signatureBytes(signature),
        new TextEncoder().encode(path),
      ),
    ).toBe(true);
    expect(new URL(url ?? "").searchParams.get("center")).toBe("auto");
  });

  it("zooms to the city when there is one, and caps the pins", async () => {
    const { config } = await testKeys();
    const one = new URL(
      (await passportMapUrl(config, [{ lat: 38.7, lng: -9.1 }])) ?? "",
    );
    expect(one.searchParams.get("center")).toBe("38.7,-9.1");
    expect(one.searchParams.get("z")).toBe("10");
    const many = new URL(
      (await passportMapUrl(
        config,
        Array.from({ length: 30 }, (_, i) => ({ lat: i, lng: i })),
      )) ?? "",
    );
    expect(JSON.parse(many.searchParams.get("annotations") ?? "")).toHaveLength(
      20,
    );
  });

  it("has no map without a city, or with a key it cannot read", async () => {
    const { config } = await testKeys();
    expect(await passportMapUrl(config, [])).toBeUndefined();
    expect(
      await passportMapUrl({ ...config, privateKey: "not a key" }, [
        { lat: 38.7, lng: -9.1 },
      ]),
    ).toBeUndefined();
  });
});
