import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Είσοδος",
  description: "Σύνδεση γραφείου",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
