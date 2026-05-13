import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatPhoneDisplay } from "@/lib/phone";
import LogoutButton from "./LogoutButton";

export default async function SuccessPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-3xl shadow-card p-8 sm:p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-ios-green/10 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-9 h-9 text-ios-green"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="text-[28px] font-semibold tracking-tight text-ios-label">
            Вы вошли
          </h1>
          <p className="text-[15px] text-ios-gray mt-1.5">
            Авторизованы как<br />
            <span className="text-ios-label font-medium">
              {formatPhoneDisplay(session.phone)}
            </span>
          </p>

          <div className="mt-8">
            <LogoutButton />
          </div>
        </div>
      </div>
    </main>
  );
}
