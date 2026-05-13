"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="w-full bg-ios-gray6 hover:bg-ios-gray5 active:scale-[0.98] text-ios-label font-medium py-4 rounded-2xl text-[17px] transition disabled:opacity-50"
    >
      {loading ? "Выход…" : "Выйти"}
    </button>
  );
}
