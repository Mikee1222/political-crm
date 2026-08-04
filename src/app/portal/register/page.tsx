import { redirect } from "next/navigation";

/** Self-registration disabled — accounts are created by CRM admins only. */
export default function PortalRegisterPage() {
  redirect(
    `/portal/login?notice=${encodeURIComponent("Η εγγραφή γίνεται μόνο από το γραφείο του βουλευτή.")}`,
  );
}
