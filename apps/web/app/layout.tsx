import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { LanguageToggle } from "@/components/language-toggle";
import { LocaleProvider } from "@/components/locale-provider";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Chaos Swarm",
  description: "Synthetic user swarm UX chaos testing demo for public web funnels.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("chaos-swarm-locale")?.value;
  const initialLocale: Locale = localeCookie === "zh" ? "zh" : "en";

  return (
    <html
      lang={initialLocale}
      className={`${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider initialLocale={initialLocale}>
          <div className="grain" />
          <LanguageToggle />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
