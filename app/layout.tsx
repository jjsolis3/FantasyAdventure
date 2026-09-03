import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hearthlight",
  description: "A wholesome, AI-guided fantasy adventure for the whole family",
  applicationName: "Hearthlight",
  // The icons themselves are picked up from the file names — `app/icon.svg`,
  // `app/favicon.ico`, `app/apple-icon.png` — and need no entry here.
  //
  // This does, though. Added to an iOS home screen, a page is labelled with
  // its `<title>`, and every screen in this app sets its own — so whichever
  // one a parent happened to be on became the name of the icon. "Hearthlight"
  // is the name of the app wherever it is saved from.
  appleWebApp: { capable: true, title: "Hearthlight", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // Tints the browser's own chrome on Android and the status bar in a saved
  // window, so the frame around the app matches the app instead of sitting in
  // a strip of white above the candlelight.
  themeColor: "#241309",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
