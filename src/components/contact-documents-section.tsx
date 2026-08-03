"use client";

import { DocumentsSection, type DocRow } from "@/components/documents-section";

/** @deprecated Prefer DocRow from documents-section */
export type ContactDocRow = DocRow;

export function ContactDocumentsSection({ contactId }: { contactId: string }) {
  return (
    <DocumentsSection
      entityType="contact"
      entityId={contactId}
      apiPath={`/api/contacts/${encodeURIComponent(contactId)}/documents`}
    />
  );
}
