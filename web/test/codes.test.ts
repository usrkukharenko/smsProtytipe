import { describe, expect, it } from "vitest";
import { generateCode } from "@/lib/codes";

describe("generateCode", () => {
  it("returns a 6-character string", () => {
    const code = generateCode();
    expect(typeof code).toBe("string");
    expect(code).toHaveLength(6);
  });

  it("contains only digits", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("pads small numbers with leading zeros", () => {
    // Run enough times that we are extremely likely to hit at least one
    // value < 100000 (~90% probability per call). Just verify all are 6 chars.
    const codes = Array.from({ length: 200 }, () => generateCode());
    for (const c of codes) {
      expect(c).toHaveLength(6);
    }
  });

  it("produces no duplicate codes in a batch of 1000 (statistical sanity)", () => {
    // Birthday-paradox math: with 10^6 possible codes, expected collisions in
    // 1000 draws is ~0.5. Allow up to 5 to keep the test stable; mainly we are
    // guarding against an obviously broken RNG (e.g. always returning "000000").
    const N = 1000;
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      seen.add(generateCode());
    }
    const uniqueRatio = seen.size / N;
    expect(uniqueRatio).toBeGreaterThan(0.99);
  });

  it("does not always return the same value", () => {
    const first = generateCode();
    let differs = false;
    for (let i = 0; i < 20; i++) {
      if (generateCode() !== first) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});
