import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Sari Food — Gestion restaurant",
  description: "Système de gestion Sari Food",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sari Food",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F85000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
