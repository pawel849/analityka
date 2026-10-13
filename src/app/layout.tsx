import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analityka lejków",
  description: "Mapowanie i analityka lejków marketingowych dla klientów",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
