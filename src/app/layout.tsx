import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitializer = `
try {
  var storedTheme = window.localStorage.getItem("partnerbird-theme:v1");
  var initialTheme = storedTheme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;
} catch (error) {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
}
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: {
    default: "PartnerBird WebMCP Demo",
    template: "%s · PartnerBird",
  },
  description:
    "A public challenge demo of safe WebMCP partnership discovery and PartnerBird Agent handoff.",
  applicationName: "PartnerBird WebMCP Demo",
  openGraph: {
    type: "website",
    siteName: "PartnerBird",
    title: "PartnerBird WebMCP Demo",
    description:
      "Safe partnership discovery through WebMCP, followed by verified PartnerBird Agent evaluation.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PartnerBird WebMCP Demo",
    description:
      "Safe partnership discovery through WebMCP, followed by verified PartnerBird Agent evaluation.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="partnerbird-theme" strategy="beforeInteractive">
          {themeInitializer}
        </Script>
        {children}
      </body>
    </html>
  );
}
