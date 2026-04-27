import { Inter } from "next/font/google";
import Script from "next/script";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalChatWidget } from "@/components/portal/portal-chat-widget";
import "./portal-theme.css";

const inter = Inter({
  subsets: ["latin", "greek"],
  display: "swap",
});

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} data-portal="1">
      <div id="fb-root" />
      <Script
        id="fb-sdk"
        src="https://connect.facebook.net/el_GR/sdk.js#xfbml=1&version=v18.0"
        strategy="lazyOnload"
        crossOrigin="anonymous"
      />
      <Script id="tiktok-embed" src="https://www.tiktok.com/embed.js" strategy="lazyOnload" />
      <PortalShell>{children}</PortalShell>
      <PortalChatWidget />
    </div>
  );
}
