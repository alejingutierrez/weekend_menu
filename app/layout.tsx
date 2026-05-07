import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Weekend Burger · Menú",
  description:
    "Aquí se viene a comer rico y ensuciarse un poco las manos. Burgers, fries y postres.",
  metadataBase: new URL("https://weekend-menu.vercel.app"),
  openGraph: {
    type: "website",
    title: "Weekend Burger · Menú",
    description: "Aquí se viene a comer rico y ensuciarse un poco las manos.",
    url: "https://weekend-menu.vercel.app/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Weekend Burger · Menú",
    description: "Aquí se viene a comer rico y ensuciarse un poco las manos.",
  },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' font-size='84'%3E%F0%9F%8D%94%3C/text%3E%3C/svg%3E",
  },
  appleWebApp: {
    title: "Weekend",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E94A4A" },
    { media: "(prefers-color-scheme: dark)", color: "#1F3EA6" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
