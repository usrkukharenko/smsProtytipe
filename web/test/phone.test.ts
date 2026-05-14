import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("normalizes pretty Russian format with +7 and punctuation", () => {
    expect(normalizePhone("+7 (999) 123-45-67")).toBe("+79991234567");
  });

  it("normalizes 8-prefixed 11-digit numbers", () => {
    expect(normalizePhone("89991234567")).toBe("+79991234567");
  });

  it("normalizes bare 10-digit numbers", () => {
    expect(normalizePhone("9991234567")).toBe("+79991234567");
  });

  it("normalizes numbers with spaces and dashes", () => {
    expect(normalizePhone("8 999 123 45 67")).toBe("+79991234567");
    expect(normalizePhone("8-999-123-45-67")).toBe("+79991234567");
  });

  it("returns null for empty / garbage input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("---")).toBeNull();
  });

  it("returns null for wrong operator (not 9xx)", () => {
    // +7 1XX... — landline, not a mobile
    expect(normalizePhone("+7 (123) 456-78-90")).toBeNull();
    expect(normalizePhone("71234567890")).toBeNull();
  });

  it("returns null for too short / too long input", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("999123456")).toBeNull(); // 9 digits
    expect(normalizePhone("799912345678")).toBeNull(); // 12 digits
  });

  it("returns null when 11-digit number does not start with 7 or 8", () => {
    expect(normalizePhone("19991234567")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("formats a normalized phone into Russian display form", () => {
    expect(formatPhoneDisplay("+79991234567")).toBe("+7 (999) 123-45-67");
  });

  it("returns the input unchanged for non-11-digit values", () => {
    expect(formatPhoneDisplay("+7999")).toBe("+7999");
  });

  it("is the inverse of normalizePhone for valid inputs", () => {
    const normalized = normalizePhone("+7 (999) 123-45-67");
    expect(normalized).not.toBeNull();
    expect(formatPhoneDisplay(normalized!)).toBe("+7 (999) 123-45-67");
  });
});
