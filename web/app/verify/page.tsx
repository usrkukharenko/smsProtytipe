"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function formatPhoneDisplay(normalized: string): string {
  const d = normalized.replace(/\D/g, "");
  if (d.length !== 11) return normalized;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

const CODE_LEN = 6;

export default function VerifyPage() {
  const router = useRouter();
  const [phone, setPhone] = useState<string>("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(60);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("auth_phone");
    if (!stored) {
      router.replace("/");
      return;
    }
    setPhone(stored);
    setTimeout(() => inputsRef.current[0]?.focus(), 50);
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function setDigit(i: number, val: string) {
    const clean = val.replace(/\D/g, "");
    setError(null);

    if (clean.length > 1) {
      const arr = Array(CODE_LEN).fill("");
      const chars = clean.slice(0, CODE_LEN).split("");
      chars.forEach((c, idx) => (arr[idx] = c));
      setDigits(arr);
      const lastIdx = Math.min(chars.length, CODE_LEN) - 1;
      inputsRef.current[lastIdx]?.focus();
      if (chars.length >= CODE_LEN) submitCode(arr.join(""));
      return;
    }

    const arr = [...digits];
    arr[i] = clean;
    setDigits(arr);

    if (clean && i < CODE_LEN - 1) {
      inputsRef.current[i + 1]?.focus();
    }
    if (clean && i === CODE_LEN - 1) {
      const full = arr.join("");
      if (full.length === CODE_LEN) submitCode(full);
    }
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  }

  async function submitCode(code: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Неверный код");
        setLoading(false);
        setDigits(Array(CODE_LEN).fill(""));
        setTimeout(() => inputsRef.current[0]?.focus(), 50);
        return;
      }
      sessionStorage.removeItem("auth_phone");
      router.push("/success");
    } catch {
      setError("Нет соединения. Попробуйте ещё раз");
      setLoading(false);
    }
  }

  async function resend() {
    if (resendIn > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось отправить");
        if (data.retryAfter) setResendIn(data.retryAfter);
      } else {
        setResendIn(60);
        setDigits(Array(CODE_LEN).fill(""));
        inputsRef.current[0]?.focus();
      }
    } catch {
      setError("Нет соединения");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-3xl shadow-card p-8 sm:p-10">
          <div className="text-center mb-8">
            <button
              onClick={() => router.back()}
              className="absolute top-6 left-6 text-ios-blue text-[15px] font-medium"
              type="button"
            >
              ‹ Назад
            </button>
            <h1 className="text-[28px] font-semibold tracking-tight text-ios-label">
              Введите код
            </h1>
            <p className="text-[15px] text-ios-gray mt-1.5">
              Мы отправили его на<br />
              <span className="text-ios-label font-medium">
                {phone ? formatPhoneDisplay(phone) : ""}
              </span>
            </p>
          </div>

          <div className="flex gap-2 justify-center mb-3">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={CODE_LEN}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                disabled={loading}
                className="w-12 h-14 text-center text-[24px] font-semibold bg-ios-gray6 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-ios-blue/30 transition text-ios-label"
              />
            ))}
          </div>

          <div className="min-h-[24px] text-center">
            {error && <p className="text-[14px] text-ios-red">{error}</p>}
            {loading && !error && (
              <p className="text-[14px] text-ios-gray">Проверяем…</p>
            )}
          </div>

          <div className="text-center mt-4">
            {resendIn > 0 ? (
              <p className="text-[14px] text-ios-gray">
                Отправить повторно через {resendIn} сек
              </p>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="text-[15px] text-ios-blue font-medium disabled:opacity-50"
              >
                {resending ? "Отправка…" : "Отправить код ещё раз"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
