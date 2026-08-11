import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sari Food — Gestion restaurant",
  description: "Système de gestion Sari Food",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
