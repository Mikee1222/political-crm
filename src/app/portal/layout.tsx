import { Inter } from "next/font/google";
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
      <PortalShell>{children}</PortalShell>
      <PortalChatWidget />
    </div>
  );
}
