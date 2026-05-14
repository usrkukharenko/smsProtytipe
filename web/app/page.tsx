"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AltchaWidget from "./AltchaWidget";

function formatRussianPhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^[78]/, "").slice(0, 10);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ].filter(Boolean);

  if (parts.length === 0) return "";
  let result = "+7 (" + parts[0];
  if (parts.length >= 2) result += ") " + parts[1];
  if (parts.length >= 3) result += "-" + parts[2];
  if (parts.length >= 4) result += "-" + parts[3];
  return result;
}

export default function PhonePage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const digitsOnly = phone.replace(/\D/g, "");
  const isComplete = digitsOnly.length === 11 || digitsOnly.length === 10;
  const canSubmit = isComplete && Boolean(altchaPayload) && !loading;

  const handleAltcha = useCallback((payload: string | null) => {
    setAltchaPayload(payload);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, altcha: altchaPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка отправки");
        setLoading(false);
        return;
      }
      const normalized = "+7" + digitsOnly.replace(/^[78]/, "");
      sessionStorage.setItem("auth_phone", normalized);
      router.push("/verify");
    } catch {
      setError("Нет соединения. Попробуйте ещё раз");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-3xl shadow-card p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-ios-blue/10 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-7 h-7 text-ios-blue"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="2" width="12" height="20" rx="3" />
                <line x1="12" y1="18" x2="12" y2="18" />
              </svg>
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight text-ios-label">
              Вход
            </h1>
            <p className="text-[15px] text-ios-gray mt-1.5">
              Введите номер телефона
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              ref={inputRef}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={(e) => {
                setError(null);
                setPhone(formatRussianPhone(e.target.value));
              }}
              className="w-full bg-ios-gray6 rounded-2xl px-4 py-4 text-[17px] text-ios-label placeholder:text-ios-gray2 outline-none focus:bg-white focus:ring-2 focus:ring-ios-blue/30 transition"
              disabled={loading}
            />

            <div className="flex justify-center">
              <AltchaWidget onSolved={handleAltcha} />
            </div>

            {error && (
              <p className="text-[14px] text-ios-red px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-ios-blue hover:bg-ios-blueHover active:scale-[0.98] disabled:bg-ios-gray4 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl text-[17px] transition"
            >
              {loading ? "Отправка…" : "Получить код"}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-ios-gray mt-5 px-6">
          Нажимая «Получить код», вы соглашаетесь с обработкой данных
        </p>
      </div>
    </main>
  );
}
