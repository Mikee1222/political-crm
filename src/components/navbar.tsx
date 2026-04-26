import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contacts", label: "Επαφές" },
  { href: "/campaigns", label: "Καμπάνιες" },
  { href: "/tasks", label: "Εργασίες" },
];

export function Navbar() {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
        <Link href="/dashboard" className="font-semibold">
          Political CRM
        </Link>
        <nav className="flex items-center gap-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm hover:underline">
              {link.label}
            </Link>
          ))}
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
