import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { PwaInstaller } from "@/components/pwa/pwa-installer";
import { resolveLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: "Match Club — Football group operations",
  description:
    "Run your amateur football group with style: matches, attendance, ratings, wallet and stats.",
  manifest: "/manifest.webmanifest",
  applicationName: "Match Club",
  appleWebApp: {
    capable: true,
    title: "Match Club",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  return (
    <html lang={locale} className="dark">
      <body className="font-sans">
        <I18nProvider locale={locale}>
          <ToastProvider>
            {children}
            <PwaInstaller />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
