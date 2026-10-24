import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PRODUCT_NAME } from "./lib/brand";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: PRODUCT_NAME,
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: "Una base reutilizable para la aplicación autenticada de tu SaaS.",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: PRODUCT_NAME,
    title: PRODUCT_NAME,
    description: "Una base reutilizable para la aplicación autenticada de tu SaaS.",
  },
  twitter: {
    card: "summary",
    title: PRODUCT_NAME,
    description: "Una base reutilizable para la aplicación autenticada de tu SaaS.",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-image-preview": "none",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="es"><body><Providers>{children}</Providers></body></html>;
}
