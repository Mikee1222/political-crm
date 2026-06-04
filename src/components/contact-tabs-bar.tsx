"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, User } from "lucide-react";
import { useContactTabs } from "@/contexts/contact-tabs-context";
import { cn } from "@/lib/utils";

export function ContactTabsBar() {
  const { tabs, activeTab, setActiveTab, closeTab } = useContactTabs();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const m = pathname.match(/^\/contacts\/([^/]+)$/);
    if (!m) return;
    const tab = tabs.find((t) => t.contactId === m[1]);
    if (tab && tab.id !== activeTab) setActiveTab(tab.id);
  }, [pathname, tabs, activeTab, setActiveTab]);

  if (tabs.length === 0) return null;

  const contactTabHref = (contactId: string) => {
    const focus = new URLSearchParams(window.location.search).get("focus") === "1";
    return focus ? `/contacts/${contactId}?focus=1` : `/contacts/${contactId}`;
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
            router.push(contactTabHref(tab.contactId));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab(tab.id);
              router.push(contactTabHref(tab.contactId));
            }
          }}
          className={cn(
            "group flex min-h-[44px] flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          <User className="h-3 w-3 flex-shrink-0" aria-hidden />
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
