import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  fetchText,
  MP_SYNC_URLS,
  normalizeTitle,
  parseHellenicBiografikaHtml,
  parseHellenicDrastirititaHtml,
  parseVouliwatchHtml,
} from "@/lib/parliament-external-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SPEECHES = 120;
const MAX_LAWS = 200;

type RowQ = { title: string; description: string | null; ministry: string | null; status: string; tags: string[] };
type RowL = {
  title: string;
  description: string | null;
  law_number: string | null;
  status: string;
  vote: string | null;
  date: string | null;
  ministry: string | null;
  url: string | null;
};

async function existingTitles(
  supabase: SupabaseClient,
  table: "parliamentary_questions" | "legislation",
  titles: string[],
) {
  const n = new Set<string>();
  if (titles.length === 0) return n;
  const CHUNK = 200;
  for (let i = 0; i < titles.length; i += CHUNK) {
    const part = titles.slice(i, i + CHUNK);
    const { data, error } = await supabase.from(table).select("title").in("title", part);
    if (error) {
      throw new Error(error.message);
    }
    for (const r of data ?? []) {
      n.add(normalizeTitle((r as { title: string }).title));
    }
  }
  return n;
}

export async function POST() {
  try {
    const { user, profile, supabase: s } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const [vouliHtml, bioHtml, actHtml] = await Promise.all([
      fetchText(MP_SYNC_URLS.vouliwatch),
      fetchText(MP_SYNC_URLS.hellenicBio),
      fetchText(MP_SYNC_URLS.hellenicActivity),
    ]);

    const vouli = parseVouliwatchHtml(vouliHtml);
    const bio = parseHellenicBiografikaHtml(bioHtml);
    const act = parseHellenicDrastirititaHtml(actHtml, vouli.profileSummary);

    const questions: RowQ[] = [];
    if (act.koinElegchos) {
      questions.push({
        title: "Ψηφιακό μητρώο παρεμβάσεων κοιν. ελέγχου (Βουλή)",
        description: [
          bio.fullName,
          `Σελίδα: ${act.koinElegchos.label}`,
          act.koinElegchos.url,
          vouli.profileSummary ? `Vouliwatch (μόνο HTML meta, SPA): ${vouli.profileSummary.slice(0, 2000)}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        ministry: null,
        status: "Κατατέθηκε",
        tags: ["hellenic", "koinovouleutikos-elenchos", "vouliwatch"],
      });
    } else if (vouli.profileSummary) {
      questions.push({
        title: "Προφίλ (Vouliwatch — HTML meta, η σελίδα MP είναι SPA)",
        description: vouli.profileSummary,
        ministry: null,
        status: "Κατατέθηκε",
        tags: ["vouliwatch", "meta"],
      });
    }

    const laws: RowL[] = [];
    for (const s of act.speeches.slice(0, MAX_SPEECHES)) {
      laws.push({
        title: s.title,
        description: s.docUrl
          ? `Πρακτικό ομιλίας (από Βουλή). Πρακτ.: ${s.docUrl} · Σελίδα συνεδρίασης: ${s.url}`
          : `Καταγραφή ομιλίας — ${s.url}`,
        law_number: null,
        status: "Κατατέθηκε",
        vote: null,
        date: s.date,
        ministry: "Βουλή — Ολομέλεια",
        url: s.docUrl ?? s.url,
      });
    }

    for (const l of act.laws.slice(0, MAX_LAWS)) {
      const isIntl = l.kind === "intl";
      laws.push({
        title: l.title,
        description: `${isIntl ? "Διεθνής" : "Νομοθέτηση (Βουλή)"} — ${l.url}`,
        law_number: null,
        status: "Υπό Εξέταση",
        vote: null,
        date: l.date,
        ministry: isIntl ? "Υπ. Εξωτερικών" : "Βουλή",
        url: l.url,
      });
    }

    const qTitles = questions.map((q) => normalizeTitle(q.title));
    const lTitles = laws.map((l) => normalizeTitle(l.title));

    const [seenQ, seenL] = await Promise.all([
      existingTitles(s, "parliamentary_questions", qTitles),
      existingTitles(s, "legislation", lTitles),
    ]);

    let imported = 0;
    let skipped = 0;

    for (const q of questions) {
      const t = normalizeTitle(q.title);
      if (seenQ.has(t)) {
        skipped += 1;
        continue;
      }
      const { error } = await s.from("parliamentary_questions").insert({
        title: q.title,
        description: q.description,
        ministry: q.ministry,
        status: q.status,
        tags: q.tags,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      seenQ.add(t);
      imported += 1;
    }

    for (const l of laws) {
      const t = normalizeTitle(l.title);
      if (seenL.has(t)) {
        skipped += 1;
        continue;
      }
      const { error } = await s.from("legislation").insert(l);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      seenL.add(t);
      imported += 1;
    }

    return NextResponse.json({ imported, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[parliament sync]", e);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      return NextResponse.json({ error: "Λήξη χρόνου — δοκιμάστε ξανά" }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
