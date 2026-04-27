/** Client-side validation helpers (Greek phone: 10 digits, national format). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const t = value.trim();
  if (!t) return "Υποχρεωτικό email";
  if (!EMAIL_RE.test(t)) return "Μη έγκυρη διεύθυνση email";
  return null;
}

/** Digits only; must be exactly 10 (e.g. Greek mobile without country code). */
export function validatePhone10(value: string, required: boolean): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return required ? "Υποχρεωτικό τηλέφωνο" : null;
  }
  if (digits.length !== 10) {
    return "Το τηλέφωνο πρέπει να έχει 10 ψηφία";
  }
  return null;
}

export function requiredText(value: string, label: string): string | null {
  if (!value.trim()) return `Υποχρεωτικό: ${label}`;
  return null;
}

export function minLength(value: string, n: number, message: string): string | null {
  if (value.trim().length < n) return message;
  return null;
}

export function mapAuthErrorToGreek(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("email not confirmed")) {
    return "Λάθος email ή κωδικός.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "Υπάρχει ήδη λογαριασμός με αυτό το email.";
  }
  if (m.includes("password")) {
    if (m.includes("at least") || m.includes("6")) {
      return "Ο κωδικός δεν πληροί τις απαιτήσεις.";
    }
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Σφάλμα δικτύου. Δοκιμάστε ξανά.";
  }
  return msg;
}
