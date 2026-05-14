"use client";

import { createElement, useEffect, useRef } from "react";

type Props = {
  onSolved: (payload: string | null) => void;
};

export default function AltchaWidget({ onSolved }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ state?: string; payload?: string }>)
        .detail;
      if (!detail) return;
      if (detail.state === "verified" && detail.payload) {
        onSolved(detail.payload);
      } else if (detail.state !== "verified") {
        onSolved(null);
      }
    };

    el.addEventListener("statechange", handler as EventListener);
    return () => {
      el.removeEventListener("statechange", handler as EventListener);
    };
  }, [onSolved]);

  // Use createElement to render the custom element without needing
  // to extend the JSX.IntrinsicElements interface (which is brittle
  // across TS/React/Next major versions).
  return createElement("altcha-widget", {
    ref,
    challengeurl: "/api/auth/altcha-challenge",
    hidefooter: "true",
    hidelogo: "true",
    strings: JSON.stringify({
      label: "Я не робот",
      verifying: "Проверка…",
      verified: "Готово",
      error: "Ошибка проверки",
    }),
  });
}
