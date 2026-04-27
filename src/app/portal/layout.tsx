import { PortalShell } from "@/components/portal/portal-shell";
import { PortalChatWidget } from "@/components/portal/portal-chat-widget";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalShell>{children}</PortalShell>
      <PortalChatWidget />
    </>
  );
}
