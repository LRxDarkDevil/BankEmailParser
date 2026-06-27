import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouthPay Financial Intelligence Engine",
  description: "Gmail collection and parsing engine for Pakistani banks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
