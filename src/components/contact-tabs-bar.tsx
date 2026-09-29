"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileText, User, X } from "lucide-react";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { cn } from "@/lib/utils";

export function ContactTabsBar() {
  const { tabs, activeTab, setActiveTab, closeTab } = useContactTabs();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const contactMatch = pathname.match(/^\/contacts\/([^/]+)$/);
    if (contactMatch) {
      const tab = tabs.find((t) => t.entityType === "contact" && t.entityId === contactMatch[1]);
      if (tab && tab.id !== activeTab) setActiveTab(tab.id);
      return;
    }
    const requestMatch = pathname.match(/^\/requests\/([^/]+)$/);
    if (requestMatch && requestMatch[1] !== "search") {
      const tab = tabs.find((t) => t.entityType === "request" && t.entityId === requestMatch[1]);
      if (tab && tab.id !== activeTab) setActiveTab(tab.id);
    }
  }, [pathname, tabs, activeTab, setActiveTab]);

  if (tabs.length === 0) return null;

  const tabHref = (tab: (typeof tabs)[number]) => {
    if (tab.entityType === "request") {
      return `/requests/${tab.entityId}`;
    }
    const focus = new URLSearchParams(window.location.search).get("focus") === "1";
    return focus ? `/contacts/${tab.entityId}?focus=1` : `/contacts/${tab.entityId}`;
  };

  return (
    <div className="flex min-h-[44px] shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 py-1.5 scrollbar-hide">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          tabIndex={0}
          aria-selected={activeTab === tab.id}
          onClick={() => {
            setActiveTab(tab.id);
            router.push(tabHref(tab));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab(tab.id);
              router.push(tabHref(tab));
            }
          }}
          className={cn(
            "group flex min-h-[44px] flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {tab.entityType === "request" ? (
            <FileText className="h-3 w-3 flex-shrink-0" aria-hidden />
          ) : (
            <User className="h-3 w-3 flex-shrink-0" aria-hidden />
          )}
          <span className="max-w-[120px] truncate">{tab.name}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="ml-1 rounded-sm opacity-60 hover:opacity-100"
            aria-label={`Κλείσιμο ${tab.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
