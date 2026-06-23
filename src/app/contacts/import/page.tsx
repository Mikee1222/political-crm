"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ContactsImportWizard } from "@/components/contacts-import-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

export default function ContactsImportPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const isManager = hasMinRole(profile?.role, "manager");

  const onImported = useCallback(() => {
    router.refresh();
  }, [router]);

  if (!isManager) {
    return (
      <div className="p-6">
        <PageHeader title="Εισαγωγή επαφών" />
        <p className="mt-4 text-sm text-[var(--text-subtitle)]">Δεν έχετε δικαίωμα εισαγωγής επαφών.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Εισαγωγή επαφών" subtitle="Οδηγός μαζικής εισαγωγής από CSV ή PDF" />
      <div className="mt-6">
        <ContactsImportWizard onImported={onImported} />
      </div>
    </div>
  );
}
