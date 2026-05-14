import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Вход",
  description: "Авторизация по СМС",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f2f2f7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">
        {children}
        <Script
          src="https://cdn.jsdelivr.net/npm/altcha/dist/altcha.min.js"
          strategy="afterInteractive"
          type="module"
        />
      </body>
    </html>
  );
}
