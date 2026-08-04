import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { PortalShell } from "@/components/portal/portal-shell";
import "./portal-theme.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  display: "swap",
});

/** Public portal is not a PWA — clear CRM manifest / apple install hints. */
export const metadata: Metadata = {
  applicationName: "Κώστας Καραγκούνης",
  title: { default: "Κώστας Καραγκούνης", template: "%s · Καραγκούνης" },
  description: "Πύλη πολιτών — ενημέρωση και επικοινωνία",
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} min-h-[100dvh] w-full max-w-full overflow-x-hidden`} data-portal="1">
      <div id="fb-root" />
      <Script
        id="fb-sdk"
        src="https://connect.facebook.net/el_GR/sdk.js#xfbml=1&version=v18.0"
        strategy="lazyOnload"
        crossOrigin="anonymous"
      />
      <PortalShell>{children}</PortalShell>
    </div>
  );
}
