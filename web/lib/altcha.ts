import { createChallenge as libCreateChallenge, verifySolution as libVerifySolution } from "altcha-lib";

function getHmacKey(): string {
  const key = process.env.ALTCHA_HMAC_KEY;
  if (!key) {
    throw new Error("ALTCHA_HMAC_KEY is not set");
  }
  return key;
}

export async function createChallenge() {
  return await libCreateChallenge({
    hmacKey: getHmacKey(),
    maxNumber: 100_000,
    expires: new Date(Date.now() + 5 * 60 * 1000),
  });
}

export async function verifySolution(payload: string): Promise<boolean> {
  if (!payload) return false;
  try {
    // altcha-lib expects either a base64-encoded JSON string or the parsed object
    const ok = await libVerifySolution(payload, getHmacKey());
    return Boolean(ok);
  } catch {
    return false;
  }
}
