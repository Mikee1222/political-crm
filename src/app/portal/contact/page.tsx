import { PortalOfficeMapsSection } from "@/components/portal/portal-office-maps-section";
import { PORTAL_SOCIAL } from "@/lib/portal-social-urls";

export const dynamic = "force-dynamic";

const ND = "#003476";
const GOLD = "#C9A84C";

export const metadata = {
  title: "Επικοινωνία | Πύλη",
  description: "Πολιτικά γραφεία, τηλέφωνα, χάρτες · Κώστας Καραγκούνης",
};

export default function PortalContactPage() {
  return (
    <div className="min-w-0 bg-[#FAFBFC] pb-16 pt-8 sm:pb-24 sm:pt-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h1
          className="text-center text-2xl font-extrabold sm:text-3xl"
          style={{ color: ND, fontWeight: 800 }}
        >
          Επικοινωνία
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 sm:text-base">
          Πολιτικά γραφεία Αγρίνιο και Αθήνα, τηλέφωνα, fax και οδηγίες με χάρτη.
        </p>
        <div
          className="mx-auto mt-3 h-1 w-20 rounded-full"
          style={{ background: `linear-gradient(90deg, ${GOLD}, #8B6914)` }}
          aria-hidden
        />
        <div className="mt-10">
          <PortalOfficeMapsSection variant="light" />
        </div>
        <div className="mt-10 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-center text-sm font-extrabold uppercase tracking-wider text-slate-500">
            Κοινωνικά δίκτυα
          </h2>
          <p className="mt-3 text-center text-sm text-slate-600 sm:text-base">
            <a
              href={PORTAL_SOCIAL.facebook}
              className="font-semibold text-[#1877F2] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook
            </a>
            <span className="mx-2 text-slate-300" aria-hidden>
              ·
            </span>
            <a
              href={PORTAL_SOCIAL.instagram}
              className="font-semibold text-fuchsia-700 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
            <span className="mx-2 text-slate-300" aria-hidden>
              ·
            </span>
            <a
              href={PORTAL_SOCIAL.tiktok}
              className="font-semibold text-zinc-800 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              TikTok
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
