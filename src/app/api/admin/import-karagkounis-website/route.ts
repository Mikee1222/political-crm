import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { isCrmUser, forbidden } from "@/lib/auth-helpers";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

const SOURCE = "https://www.karagkounis.gr/";

function contentFromExcerpt(excerpt: string, title: string) {
  return `${excerpt.trim()}\n\n---\n\n*Άρθρο από [karagkounis.gr](${SOURCE}) · ${title}*`;
}

const NEWS_ROWS: {
  title: string;
  slug: string;
  category: string;
  published_at: string;
  cover_image: string;
  excerpt: string;
}[] = [
  {
    title: "Κ. Καραγκούνης στο Πρώτο: Σημασία δεν έχουν τόσο τα πρόσωπα όσο οι πολιτικές",
    slug: "karagkounis-proto-prosopa-politikes",
    category: "Δημοσιεύματα",
    published_at: "2025-03-14",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2025/03/karagounis2-768x483-1.jpg",
    excerpt: "Συνέντευξη του βουλευτή Κ. Καραγκούνη στο Πρώτο για την πολιτική επικαιρότητα.",
  },
  {
    title: "Κώστας Καραγκούνης στο Μανιφέστο: Πολιτική νοσηρότητα",
    slug: "karagkounis-manifesto-politiki-nosirotita",
    category: "Δημοσιεύματα",
    published_at: "2025-03-07",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2019/09/w18-111126w0511591220456123.jpg",
    excerpt: "Άρθρο του βουλευτή Κ. Καραγκούνη στο Μανιφέστο.",
  },
  {
    title: "Κ.Καραγκούνης: Εργαζόμενοι προστατευμένοι και καλύτερα πληρωμένοι",
    slug: "karagkounis-ergazomenoi-prostateymenoi",
    category: "Συνεντεύξεις",
    published_at: "2025-02-17",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2025/03/480202608_1177571977705619_2866608650063395429_n.jpg",
    excerpt: "Συνέντευξη για την προστασία των εργαζομένων.",
  },
  {
    title: "Αρχές Δεκεμβρίου η προσωρινή γέφυρα στον Εύηνο",
    slug: "prosorini-gefyra-eyino",
    category: "Δράση στο Νομό",
    published_at: "2022-11-24",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2022/12/316675918_584084423721047_429886099093275619_n.jpg",
    excerpt: "Ο βουλευτής Κ. Καραγκούνης ανακοίνωσε την τοποθέτηση προσωρινής γέφυρας στον Εύηνο.",
  },
  {
    title: "Συνάντηση Καραγκούνη-Γεωργαντά για τα τέλη άρδευσης που πλήττουν τους αγρότες",
    slug: "synantisi-karagkoyni-georganta-ardeysis",
    category: "Δράση στο Νομό",
    published_at: "2022-11-16",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2022/12/315324095_576873971108759_1837254004145585686_n.jpg",
    excerpt:
      "Συνάντηση για το ζήτημα της αύξησης των τελών άρδευσης που επιβαρύνουν τους αγρότες της Αιτωλοακαρνανίας.",
  },
  {
    title: "Ερώτηση βουλευτών ΝΔ Αιτωλοακαρνανίας προς Υπουργό Παιδείας Νίκη Κεραμέως",
    slug: "erotisi-nd-aitoloakarnanias-kerameos-paideia",
    category: "Κοινοβουλευτική Παρουσία",
    published_at: "2021-02-23",
    cover_image: "https://www.karagkounis.gr/wp-content/uploads/2021/02/article_21.jpg",
    excerpt:
      "Ερώτηση κατέθεσαν οι βουλευτές ΝΔ Αιτωλοακαρνανίας Κωνσταντίνος Καραγκούνης και Μάριος Σαλμάς προς την Υπουργό Παιδείας.",
  },
];

const PARL_ROWS: { title: string; ministry: string; status: string; submitted_date: string }[] = [
  {
    title: "Ερώτηση προς Υπουργό Παιδείας Κεραμέως",
    ministry: "Υπουργείο Παιδείας",
    status: "Απαντήθηκε",
    submitted_date: "2021-02-23",
  },
  {
    title: "Παρέμβαση στη μικτή ομάδα ελέγχου της Europol",
    ministry: "Ευρωπαϊκό Κοινοβούλιο",
    status: "Απαντήθηκε",
    submitted_date: "2023-04-02",
  },
];

/**
 * One-time import: news_posts (upsert on slug, ignore duplicates) + parliamentary_questions (skip if same title+date).
 * Admin + CRM only; inserts via service role.
 */
export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile } = crm;
    if (!isCrmUser(profile) || profile?.role !== "admin") {
      return forbidden();
    }

    const admin = createServiceClient();
    const now = new Date().toISOString();

    const newsPayload = NEWS_ROWS.map((n) => ({
      title: n.title,
      slug: n.slug,
      category: n.category,
      excerpt: n.excerpt,
      content: contentFromExcerpt(n.excerpt, n.title),
      cover_image: n.cover_image,
      published: true,
      published_at: `${n.published_at}T12:00:00.000Z`,
      created_by: user.id,
      updated_at: now,
    }));

    const { error: newsErr, data: newsData } = await admin
      .from("news_posts")
      .upsert(newsPayload, { onConflict: "slug", ignoreDuplicates: true })
      .select("id, slug");

    if (newsErr) {
      return NextResponse.json({ error: newsErr.message, code: newsErr.code }, { status: 400 });
    }

    const parlInserted: string[] = [];
    const parlSkipped: string[] = [];
    for (const q of PARL_ROWS) {
      const { data: existing } = await admin
        .from("parliamentary_questions")
        .select("id")
        .eq("title", q.title)
        .eq("submitted_date", q.submitted_date)
        .maybeSingle();
      if (existing?.id) {
        parlSkipped.push(q.title);
        continue;
      }
      const { error: pErr } = await admin.from("parliamentary_questions").insert({
        title: q.title,
        ministry: q.ministry,
        status: q.status,
        submitted_date: q.submitted_date,
        description: null,
      } as never);
      if (pErr) {
        return NextResponse.json({ error: pErr.message, at: "parliamentary_questions" }, { status: 400 });
      }
      parlInserted.push(q.title);
    }

    return NextResponse.json({
      ok: true,
      news: {
        attempted: NEWS_ROWS.length,
        returned: (newsData ?? []).length,
        slugs: newsPayload.map((r) => r.slug),
      },
      parliament: { inserted: parlInserted, skipped: parlSkipped },
    });
  } catch (e) {
    console.error("[api/admin/import-karagkounis-website]", e);
    if (e instanceof Error && e.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return nextJsonError();
  }
}
