import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_SECRET = "test_secret_min_16_chars_long";
const ORIGINAL_SECRET = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  }
});

describe("createSession / verifySessionToken", () => {
  it("round-trips a valid payload", async () => {
    const { createSession, verifySessionToken } = await import("@/lib/auth");
    const phone = "+79991234567";
    const token = await createSession({ phone });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.phone).toBe(phone);
  });

  it("returns null for a tampered token", async () => {
    const { createSession, verifySessionToken } = await import("@/lib/auth");
    const token = await createSession({ phone: "+79991234567" });

    // Flip a character in the signature segment.
    const parts = token.split(".");
    const sig = parts[2];
    const swapped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${swapped}`;

    const payload = await verifySessionToken(tampered);
    expect(payload).toBeNull();
  });

  it("rejects a token whose payload was swapped (different signed body)", async () => {
    const { createSession, verifySessionToken } = await import("@/lib/auth");
    const tokenA = await createSession({ phone: "+79991234567" });
    const tokenB = await createSession({ phone: "+79990000000" });

    // Splice tokenB's payload into tokenA's header/signature — the signature
    // will no longer match the payload, so verification must fail.
    const [headerA, , sigA] = tokenA.split(".");
    const [, payloadB] = tokenB.split(".");
    const frankenstein = `${headerA}.${payloadB}.${sigA}`;

    expect(await verifySessionToken(frankenstein)).toBeNull();
  });

  it("returns null for malformed tokens", async () => {
    const { verifySessionToken } = await import("@/lib/auth");
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("a.b.c")).toBeNull();
  });
});
