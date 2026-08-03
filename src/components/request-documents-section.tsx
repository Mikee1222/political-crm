"use client";

import { DocumentsSection } from "@/components/documents-section";

export function RequestDocumentsSection({
  requestId,
  canManage,
}: {
  requestId: string;
  canManage: boolean;
}) {
  return (
    <DocumentsSection
      entityType="request"
      entityId={requestId}
      apiPath={`/api/requests/${encodeURIComponent(requestId)}/documents`}
      canManage={canManage}
    />
  );
}
