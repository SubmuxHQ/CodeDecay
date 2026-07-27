import type { Metadata } from "next";
import { siteOrigin } from "../lib/source";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeDecay Judge Lab — Find what your coding agent missed",
  description:
    "Run a real CodeDecay PR red-team scenario in one click. Inspect evidence, weak tests, user impact, and merge-ready repair tasks.",
  metadataBase: new URL(siteOrigin()),
  openGraph: {
    title: "CodeDecay Judge Lab",
    description: "One click. One risky PR. See what your coding agent missed.",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "CodeDecay Judge Lab — find what your coding agent missed",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeDecay Judge Lab",
    description: "One click. One risky PR. See what your coding agent missed.",
    images: ["/og.png"],
  },
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
