"""
Migration Script: Old Political CRM → Supabase
================================================
Usage:
    pip install supabase pandas openpyxl
    python migrate.py                  # Full migration
    python migrate.py --dry-run        # Test με 100 records

Field Mapping (παλιά → νέα):
    person.onoma          → contacts.first_name
    person.eponimo        → contacts.last_name
    person.patronimo      → contacts.father_name
    person.mitronimo      → contacts.mother_name
    person.fylo           → contacts.gender
    person.genethlia      → contacts.birthday
    person.giorti         → contacts.name_day
    person_phone(type=1)  → contacts.phone      (κινητό #1)
    person_phone(type=1)  → contacts.phone2     (κινητό #2)
    person_phone(type=2)  → contacts.landline   (σταθερό)
    person_social(type=1) → contacts.email
    person_job.name       → contacts.occupation
    person_toponimio.name → contacts.toponym
    person.ekl_ar         → contacts.electoral_district
    person_source.name    → contacts.source
    person_group          → contacts.group_id
    person_info.info      → contact_notes.content
    aitima                → requests
    aitima_info.info      → request_notes.content
    aitima_category.title → requests.category

Phone type mapping:
    1 = κινητό, 2 = σταθερό, 3 = εργασίας, 4 = fax, 5 = άλλο

Aitima status mapping:
    0 = Νέο, 1 = Σε εξέλιξη, 2 = Ολοκληρώθηκε, 3 = Απορρίφθηκε
"""

import sys
import os
import logging
import argparse
import pandas as pd
from datetime import datetime
from supabase import create_client, Client

# ─── CONFIG ──────────────────────────────────────────────────
SUPABASE_URL = "https://viibonjvztoczcrftdea.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SERVICE_ROLE_KEY_HERE")

DATA_DIR = "./data"   # φάκελος με τα xlsx αρχεία

FILES = {
    "person":               "person_202605211625.xlsx",
    "person_phone":         "person_phone_202605211625.xlsx",
    "person_social":        "person_social_202605211625.xlsx",
    "person_info":          "person_info_202605211625.xlsx",
    "person_job":           "person_job_202605211625.xlsx",
    "person_toponimio":     "person_toponimio_202605211625.xlsx",
    "person_group":         "person_group_202605211625.xlsx",
    "person_has_groups":    "person_has_groups_202605211625.xlsx",
    "person_source":        "person_source_202605211625.xlsx",
    "person_has_sources":   "person_has_sources_202605211625.xlsx",
    "aitima":               "aitima_202605211626.xlsx",
    "aitima_info":          "aitima_info_202605211627.xlsx",
    "aitima_category":      "aitima_category_202605211626.xlsx",
    "aitima_has_categories":"aitima_has_categories_202605211626.xlsx",
    "aitima_persons":       "aitima_persons_202605211627.xlsx",
}

BATCH_SIZE = 500

STATUS_MAP = {
    0: "Νέο",
    1: "Σε εξέλιξη",
    2: "Ολοκληρώθηκε",
    3: "Απορρίφθηκε",
}

# ─── LOGGING ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("migration_log.txt", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

stats = {
    "contact_groups":         {"ok": 0, "fail": 0},
    "contacts":               {"ok": 0, "fail": 0},
    "contact_group_members":  {"ok": 0, "fail": 0},
    "contact_notes":          {"ok": 0, "fail": 0},
    "requests":               {"ok": 0, "fail": 0},
    "request_notes":          {"ok": 0, "fail": 0},
    "toponyms":               {"ok": 0, "fail": 0},
}

# ─── HELPERS ─────────────────────────────────────────────────
def load(key):
    path = os.path.join(DATA_DIR, FILES[key])
    log.info(f"Loading {key} from {path}")
    return pd.read_excel(path)

def clean(val):
    if pd.isna(val):
        return None
    if isinstance(val, pd.Timestamp):
        return val.isoformat()
    return val

def s(val):
    v = clean(val)
    return str(v).strip() if v is not None else None

def format_electoral_district(raw):
    """Convert Excel float codes (e.g. 120980008035.0) to text."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    raw_ed = raw
    if not raw_ed and raw_ed != 0:
        return None
    try:
        return str(int(float(str(raw_ed))))
    except (ValueError, TypeError):
        text = str(raw_ed).strip()
        return text or None

def build_toponym_to_municipality(topo_df):
    """toponym name → municipality from person_toponimio Excel."""
    toponym_col = "toponimio" if "toponimio" in topo_df.columns else "name"
    if "municipality" in topo_df.columns:
        muni_col = "municipality"
    elif "dimotiki_enotita" in topo_df.columns:
        muni_col = "dimotiki_enotita"
    else:
        muni_col = None

    lookup = {}
    for _, r in topo_df.iterrows():
        topo_name = s(r.get(toponym_col))
        if not topo_name:
            continue
        muni = s(r.get(muni_col)) if muni_col else None
        if muni:
            lookup[topo_name] = muni
    return lookup

def upsert_batch(supabase: Client, table: str, records: list, dry_run: bool):
    if dry_run:
        log.info(f"[DRY RUN] Would upsert {len(records)} → {table}")
        stats[table]["ok"] += len(records)
        return
    try:
        supabase.table(table).upsert(records, on_conflict="id").execute()
        stats[table]["ok"] += len(records)
    except Exception as e:
        log.error(f"Batch fail on {table}: {e}")
        stats[table]["fail"] += len(records)

def insert_batch(supabase: Client, table: str, records: list, dry_run: bool):
    if dry_run:
        log.info(f"[DRY RUN] Would insert {len(records)} → {table}")
        stats[table]["ok"] += len(records)
        return
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            supabase.table(table).insert(batch).execute()
            stats[table]["ok"] += len(batch)
        except Exception as e:
            log.error(f"Batch {i}–{i+len(batch)} fail on {table}: {e}")
            # Record-by-record fallback
            for rec in batch:
                try:
                    supabase.table(table).insert(rec).execute()
                    stats[table]["ok"] += 1
                except Exception as e2:
                    log.warning(f"Record fail on {table}: {e2} | data: {rec}")
                    stats[table]["fail"] += 1

# ─── STEP 1: CONTACT GROUPS ──────────────────────────────────
def migrate_groups(supabase, dry_run):
    log.info("=== STEP 1: contact_groups ===")
    df = load("person_group")
    group_id_map = {}   # old pgID (str) → new Supabase uuid

    records = []
    for _, row in df.iterrows():
        records.append({
            "name":        s(row["name"]) or "ΧΩΡΙΣ ΟΝΟΜΑ",
            "color":       "#003476",
            "description": None,
        })

    if not dry_run:
        for rec in records:
            try:
                res = supabase.table("contact_groups").insert(rec).execute()
                new_id = res.data[0]["id"]
                # map: find original pgID by name
                match = df[df["name"] == rec["name"]]
                if not match.empty:
                    group_id_map[str(int(match.iloc[0]["pgID"]))] = new_id
                stats["contact_groups"]["ok"] += 1
            except Exception as e:
                log.warning(f"Group fail: {e} | {rec}")
                stats["contact_groups"]["fail"] += 1
    else:
        log.info(f"[DRY RUN] Would insert {len(records)} groups")
        stats["contact_groups"]["ok"] += len(records)

    log.info(f"Groups done. Map size: {len(group_id_map)}")
    return group_id_map

# ─── STEP 2: CONTACTS ────────────────────────────────────────
def migrate_contacts(supabase, group_id_map, dry_run, dry_run_limit=100):
    log.info("=== STEP 2: contacts ===")

    persons     = load("person")
    phones_df   = load("person_phone")
    social_df   = load("person_social")
    jobs_df     = load("person_job")
    topo_df     = load("person_toponimio")
    sources_df  = load("person_source")
    has_groups  = load("person_has_groups")
    has_sources = load("person_has_sources")

    # Build lookup dicts
    job_map    = dict(zip(jobs_df["objID"], jobs_df["name"]))
    topo_map   = dict(zip(topo_df["objID"], topo_df["name"]))
    source_map = dict(zip(sources_df["sID"], sources_df["name"]))
    toponym_to_municipality = build_toponym_to_municipality(topo_df)

    # phone lookup: personID → list of (number, type)
    phone_lookup = {}
    for _, r in phones_df.iterrows():
        pid = int(r["personID"])
        phone_lookup.setdefault(pid, []).append((s(r["number"]), int(r["type"])))

    # email lookup: personID → first email
    email_lookup = {}
    for _, r in social_df[social_df["type"] == 1].iterrows():
        pid = int(r["personID"])
        if pid not in email_lookup:
            email_lookup[pid] = s(r["data"])

    # group lookup: personID → first group
    group_lookup = {}
    for _, r in has_groups.iterrows():
        pid = int(r["pID"])
        if pid not in group_lookup:
            group_lookup[pid] = int(r["gID"])

    # source lookup: personID → first source
    source_lookup = {}
    for _, r in has_sources.iterrows():
        pid = int(r["pID"])
        if pid not in source_lookup:
            source_lookup[pid] = int(r["sID"])

    # Filter deleted
    active = persons[persons["deleted"] == 0].copy()
    if dry_run:
        active = active.head(dry_run_limit)
        log.info(f"[DRY RUN] Processing {len(active)} contacts")

    old_to_new = {}   # old personID (str) → new contact uuid
    batch = []
    counter = 0

    for _, row in active.iterrows():
        pid = int(row["personID"])
        counter += 1

        # Phones
        person_phones = phone_lookup.get(pid, [])
        mobiles  = [n for n, t in person_phones if t == 1]
        landlines = [n for n, t in person_phones if t == 2]

        phone  = mobiles[0] if len(mobiles) > 0 else None
        phone2 = mobiles[1] if len(mobiles) > 1 else None
        landline = landlines[0] if landlines else None

        # Group (primary = first group for backward compatibility)
        old_gid = group_lookup.get(pid)
        new_gid = group_id_map.get(str(old_gid)) if old_gid else None

        # Source
        old_sid = source_lookup.get(pid)
        source_name = source_map.get(old_sid) if old_sid else None

        toponym_val = topo_map.get(clean(row.get("toponimioID"))) or ""
        municipality_raw = toponym_to_municipality.get(toponym_val, row.get("municipality", ""))
        municipality_val = s(municipality_raw) if municipality_raw is not None and not (isinstance(municipality_raw, float) and pd.isna(municipality_raw)) else None

        raw_ed = row.get("ekl_ar") or row.get("eklKodikos") or row.get("electoral_district")

        rec = {
            "contact_code":        f"EP-{counter:06d}",
            "first_name":          s(row["onoma"]),
            "last_name":           s(row["eponimo"]),
            "father_name":         s(row["patronimo"]),
            "mother_name":         s(row["mitronimo"]),
            "gender":              s(row["fylo"]),
            "birthday":            clean(row.get("genethlia")),
            "name_day":            clean(row.get("giorti")),
            "phone":               phone,
            "phone2":              phone2,
            "landline":            landline,
            "email":               email_lookup.get(pid),
            "toponym":             toponym_val or None,
            "municipality":        municipality_val,
            "electoral_district":  format_electoral_district(raw_ed),
            "occupation":          job_map.get(clean(row.get("douleiaID"))),
            "source":              source_name,
            "group_id":            new_gid,
            "is_dead":             bool(row.get("dead", 0)),
            "old_person_id":       pid,
            "created_at":          clean(row.get("dcreated")),
        }

        batch.append(rec)

        if len(batch) >= BATCH_SIZE:
            _flush_contacts(supabase, batch, old_to_new, dry_run)
            batch = []

    if batch:
        _flush_contacts(supabase, batch, old_to_new, dry_run)

    log.info(f"Contacts done. Mapped: {len(old_to_new)}")
    return old_to_new

def _flush_contacts(supabase, batch, old_to_new, dry_run):
    if dry_run:
        log.info(f"[DRY RUN] Would insert {len(batch)} contacts")
        stats["contacts"]["ok"] += len(batch)
        return
    for rec in batch:
        old_id = rec["old_person_id"]
        try:
            # Upsert by phone if exists
            if rec["phone"]:
                existing = supabase.table("contacts").select("id").eq("phone", rec["phone"]).execute()
                if existing.data:
                    new_id = existing.data[0]["id"]
                    supabase.table("contacts").update(rec).eq("id", new_id).execute()
                    old_to_new[str(old_id)] = new_id
                    stats["contacts"]["ok"] += 1
                    continue
            res = supabase.table("contacts").insert(rec).execute()
            old_to_new[str(old_id)] = res.data[0]["id"]
            stats["contacts"]["ok"] += 1
        except Exception as e:
            log.warning(f"Contact fail (old_id={old_id}): {e}")
            stats["contacts"]["fail"] += 1

# ─── STEP 2b: CONTACT GROUP MEMBERS (many-to-many) ───────────
def migrate_contact_group_members(supabase, person_has_groups_df, old_to_new_contact_map, group_id_map, dry_run=False):
    """Insert all group memberships into contact_group_members junction table."""
    log.info("=== STEP 2b: contact_group_members ===")
    rows = []
    for _, row in person_has_groups_df.iterrows():
        pid = str(row["pID"])
        gid = str(row["gID"])
        contact_uuid = old_to_new_contact_map.get(pid)
        group_uuid = group_id_map.get(gid)
        if contact_uuid and group_uuid:
            rows.append({
                "contact_id": contact_uuid,
                "group_id": group_uuid,
            })

    seen = set()
    unique_rows = []
    for r in rows:
        key = (r["contact_id"], r["group_id"])
        if key not in seen:
            seen.add(key)
            unique_rows.append(r)

    log.info(f"Inserting {len(unique_rows)} contact_group_members...")
    if dry_run:
        log.info(f"[DRY RUN] Would upsert {len(unique_rows)} contact_group_members")
        stats["contact_group_members"]["ok"] += len(unique_rows)
        return

    for i in range(0, len(unique_rows), BATCH_SIZE):
        batch = unique_rows[i:i + BATCH_SIZE]
        try:
            supabase.table("contact_group_members").upsert(
                batch, on_conflict="contact_id,group_id"
            ).execute()
            stats["contact_group_members"]["ok"] += len(batch)
        except Exception as e:
            log.error(f"Batch fail on contact_group_members: {e}")
            stats["contact_group_members"]["fail"] += len(batch)

    log.info("Done contact_group_members")

# ─── STEP 3: CONTACT NOTES ───────────────────────────────────
def migrate_contact_notes(supabase, old_to_new, dry_run, dry_run_limit=100):
    log.info("=== STEP 3: contact_notes ===")
    df = load("person_info")
    active = df[df["deleted"] == 0].copy()
    if dry_run:
        active = active.head(dry_run_limit)

    batch = []
    for _, row in active.iterrows():
        pid = int(row["pID"])
        new_cid = old_to_new.get(str(pid))
        if not new_cid:
            continue
        content = s(row["info"])
        if not content:
            continue
        batch.append({
            "contact_id": new_cid,
            "content":    content,
            "created_at": clean(row.get("dadded")),
        })

    insert_batch(supabase, "contact_notes", batch, dry_run)
    log.info(f"Contact notes done.")

# ─── STEP 4: REQUESTS ────────────────────────────────────────
def migrate_requests(supabase, old_to_new, dry_run, dry_run_limit=100):
    log.info("=== STEP 4: requests ===")
    aitima_df   = load("aitima")
    aitima_p    = load("aitima_persons")
    categories  = load("aitima_category")
    has_cat     = load("aitima_has_categories")

    cat_map = dict(zip(categories["cID"], categories["title"]))

    # Primary contact per aitima (role=1)
    primary_contact = {}
    for _, r in aitima_p[aitima_p["role"] == 1].iterrows():
        aid = int(r["aID"])
        if aid not in primary_contact and pd.notna(r["pID"]):
            primary_contact[aid] = int(r["pID"])

    # Category per aitima (first category)
    aitima_cat = {}
    for _, r in has_cat.iterrows():
        aid = int(r["aID"])
        if aid not in aitima_cat:
            aitima_cat[aid] = cat_map.get(int(r["cID"]))

    active = aitima_df[aitima_df["deleted"] == 0].copy()
    if dry_run:
        active = active.head(dry_run_limit)

    old_req_to_new = {}
    batch = []
    counter = 0

    for _, row in active.iterrows():
        aid = int(row["aID"])
        counter += 1

        old_pid = primary_contact.get(aid)
        new_cid = old_to_new.get(str(old_pid)) if old_pid else None

        status_raw = int(row.get("status", 1))
        status = STATUS_MAP.get(status_raw, "Νέο")

        category = aitima_cat.get(aid)
        title = s(row.get("title")) or ""
        if not title:
            title = category or "Αίτημα"

        batch.append({
            "request_code":  f"AIT-{counter:06d}",
            "title":         title,
            "contact_id":    new_cid,
            "category":      category,
            "status":        status,
            "priority":      "Medium",
            "old_aitima_id": aid,
            "created_at":    clean(row.get("dadded")),
        })

        if len(batch) >= BATCH_SIZE:
            _flush_requests(supabase, batch, old_req_to_new, dry_run)
            batch = []

    if batch:
        _flush_requests(supabase, batch, old_req_to_new, dry_run)

    log.info(f"Requests done. Mapped: {len(old_req_to_new)}")
    return old_req_to_new

def _flush_requests(supabase, batch, old_req_to_new, dry_run):
    if dry_run:
        log.info(f"[DRY RUN] Would insert {len(batch)} requests")
        stats["requests"]["ok"] += len(batch)
        return
    for rec in batch:
        old_id = rec["old_aitima_id"]
        try:
            res = supabase.table("requests").insert(rec).execute()
            old_req_to_new[old_id] = res.data[0]["id"]
            stats["requests"]["ok"] += 1
        except Exception as e:
            log.warning(f"Request fail (old_id={old_id}): {e}")
            stats["requests"]["fail"] += 1

# ─── STEP 5: REQUEST NOTES ───────────────────────────────────
def migrate_request_notes(supabase, old_req_to_new, dry_run, dry_run_limit=100):
    log.info("=== STEP 5: request_notes ===")
    df = load("aitima_info")
    active = df[df["deleted"] == 0].copy()
    if dry_run:
        active = active.head(dry_run_limit)

    batch = []
    for _, row in active.iterrows():
        aid = int(row["aID"])
        new_rid = old_req_to_new.get(aid)
        if not new_rid:
            continue
        content = s(row["info"])
        if not content:
            continue
        batch.append({
            "request_id": new_rid,
            "content":    content,
            "created_at": clean(row.get("dadded")),
        })

    insert_batch(supabase, "request_notes", batch, dry_run)
    log.info(f"Request notes done.")

# ─── STEP 6: TOPONYMS ────────────────────────────────────────
def migrate_toponyms(supabase, dry_run):
    log.info("=== STEP 6: toponyms ===")
    df = load("person_toponimio")
    batch = [{"name": s(row["name"])} for _, row in df.iterrows() if s(row["name"])]
    insert_batch(supabase, "toponyms", batch, dry_run)
    log.info(f"Toponyms done.")

# ─── MAIN ────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Test mode: 100 records only")
    args = parser.parse_args()

    dry_run = args.dry_run
    mode = "DRY RUN (100 records)" if dry_run else "FULL MIGRATION"
    log.info(f"{'='*60}")
    log.info(f"  Migration started — {mode}")
    log.info(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"{'='*60}")

    if SUPABASE_KEY == "YOUR_SERVICE_ROLE_KEY_HERE":
        log.error("❌ Set SUPABASE_KEY env variable first!")
        log.error("   export SUPABASE_KEY='eyJ...'")
        sys.exit(1)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    log.info("✅ Supabase connected")

    group_id_map   = migrate_groups(supabase, dry_run)
    old_to_new     = migrate_contacts(supabase, group_id_map, dry_run)
    person_has_groups_df = load("person_has_groups")
    migrate_contact_group_members(supabase, person_has_groups_df, old_to_new, group_id_map, dry_run)
    migrate_contact_notes(supabase, old_to_new, dry_run)
    old_req_to_new = migrate_requests(supabase, old_to_new, dry_run)
    migrate_request_notes(supabase, old_req_to_new, dry_run)
    migrate_toponyms(supabase, dry_run)

    # ── SUMMARY ──
    log.info(f"\n{'='*60}")
    log.info("  MIGRATION SUMMARY")
    log.info(f"{'='*60}")
    total_ok = total_fail = 0
    for table, s_ in stats.items():
        log.info(f"  {table:<20} ✅ {s_['ok']:>7}   ❌ {s_['fail']:>5}")
        total_ok   += s_["ok"]
        total_fail += s_["fail"]
    log.info(f"{'─'*60}")
    log.info(f"  {'TOTAL':<20} ✅ {total_ok:>7}   ❌ {total_fail:>5}")
    log.info(f"{'='*60}")
    log.info(f"  Log saved → migration_log.txt")

if __name__ == "__main__":
    main()
