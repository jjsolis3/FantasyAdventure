import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hearthlight",
  description: "A wholesome, AI-guided fantasy adventure for the whole family",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
