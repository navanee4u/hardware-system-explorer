import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hardware System Explorer",
  description:
    "Three verified SWAP-C designs, ranked — a human picks, the system learns, and every step shows live.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
