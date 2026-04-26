"use client";

import { ChevronDown, Download, Eye, Pencil, Phone, Plus } from "lucide-react";
import { ContactsImportWizard } from "@/components/contacts-import-wizard";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MUNICIPALITIES } from "@/lib/aitoloakarnania-data";
import { useProfile } from "@/contexts/profile-context";
import { AitoloakarnaniaLocationFields } from "@/components/aitoloakarnania-location-fields";
import { hasMinRole } from "@/lib/roles";
import { avatarContact, callStatusLabel, callStatusPill, lux, priorityPill } from "@/lib/luxury-styles";

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  area: string | null;
  municipality: string | null;
  call_status: string | null;
  priority: string | null;
  tags: string[] | null;
};

type Camp = { id: string; name: string };

function ContactSwipeCard({
  c,
  onCall,
  onOpenDetail,
}: {
  c: Contact;
  onCall: () => void;
  onOpenDetail: () => void;
}) {
  const st = c.call_status ?? "Pending";
  const pr = c.priority ?? "Medium";
  const skipNav = useRef(false);
  const touch0 = useRef<{ x: number; moved: boolean } | null>(null);

  return (
    <div
      className="relative touch-pan-y overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-md"
      onTouchStart={(e) => {
        touch0.current = { x: e.touches[0].clientX, moved: false };
      }}
      onTouchMove={(e) => {
        const t = touch0.current;
        if (t && Math.abs(e.touches[0].clientX - t.x) > 14) t.moved = true;
      }}
      onTouchEnd={(e) => {
        const t0 = touch0.current;
        touch0.current = null;
        if (!t0) return;
        const d = e.changedTouches[0].clientX - t0.x;
        if (t0.moved && d > 48) {
          skipNav.current = true;
          onCall();
          return;
        }
        if (t0.moved && d < -48) {
          skipNav.current = true;
          onOpenDetail();
        }
      }}
      onClick={() => {
        if (skipNav.current) {
          skipNav.current = false;
          return;
        }
        onOpenDetail();
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 flex max-md:select-none" aria-hidden>
        <div className="flex w-14 shrink-0 items-center justify-center" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.3), transparent)" }}>
          <span className="text-[9px] font-bold uppercase text-[var(--accent-gold)] [writing-mode:vertical-rl]">Κλήση</span>
        </div>
        <div className="min-w-0 flex-1" />
        <div
          className="flex w-14 shrink-0 items-center justify-center"
          style={{ background: "linear-gradient(270deg, rgba(0,52,118,0.35), transparent)" }}
        >
          <Pencil className="h-4 w-4 text-sky-200" aria-hidden />
        </div>
      </div>
      <div className="relative z-[1] flex min-h-[4.5rem] min-w-0 items-center gap-3 p-3 pl-2 pr-2">
        <div className={avatarContact + " !h-12 !w-12 shrink-0 text-sm"}>
          {`${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`}
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <p className="font-semibold text-[var(--text-primary)]">
            {c.first_name} {c.last_name}
          </p>
          <p className="mt-0.5 font-mono text-[13px] text-[var(--text-secondary)]">{c.phone || "—"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={
                "inline-flex min-h-6 min-w-0 max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
                (callStatusPill[st] ?? callStatusPill.Pending)
              }
            >
              {callStatusLabel(c.call_status)}
            </span>
            <span
              className={
                "inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-xs font-medium " + (priorityPill[pr] ?? priorityPill.Medium)
              }
            >
              {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function filterParams(
  search: string,
  callStatus: string,
  area: string,
  priority: string,
  tag: string,
  namedayToday: boolean,
  municipality: string,
) {
  const p = new URLSearchParams();
  if (search) p.set("search", search);
  if (callStatus) p.set("call_status", callStatus);
  if (area) p.set("area", area);
  if (municipality) p.set("municipality", municipality);
  if (priority) p.set("priority", priority);
  if (tag) p.set("tag", tag);
  if (namedayToday) p.set("nameday_today", "1");
  p.set("filters", "1");
  return p;
}

function ContactsPage() {
  const { profile } = useProfile();
  const canManage = hasMinRole(profile?.role, "manager");
  const isAdmin = profile?.role === "admin";
  const router = useRouter();
  const searchParams = useSearchParams();
  const namedayToday = searchParams.get("nameday_today") === "1";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [callStatus, setCallStatus] = useState("");
  const [area, setArea] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Pending");
  const [bulkCampaign, setBulkCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<Camp[]>([]);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ search, call_status: callStatus, area, priority, tag });
    if (municipality) params.set("municipality", municipality);
    if (namedayToday) {
      params.set("nameday_today", "1");
    }
    const res = await fetch(`/api/contacts?${params.toString()}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
  }, [search, callStatus, area, municipality, priority, tag, namedayToday]);

  useLayoutEffect(() => {
    setMunicipality(searchParams.get("municipality") ?? "");
    setCallStatus(searchParams.get("call_status") ?? "");
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setCampaigns((d.campaigns as Camp[] | undefined) ?? []);
      })
      .catch(() => setCampaigns([]));
  }, [canManage]);

  const areas = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.area).filter(Boolean))) as string[],
    [contacts],
  );

  const selectedIds = [...selected];
  const allChecked = contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  const triggerCall = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
  };

  const triggerCallById = async (id: string) => {
    await fetch("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: id }),
    });
  };

  const postBulk = async (action: "update_status" | "add_to_campaign" | "delete", value?: string) => {
    if (!selectedIds.length) return;
    setBulkErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/contacts/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedIds, action, value: value ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBulkErr(j.error ?? "Σφάλμα");
        return;
      }
      setSelected(new Set());
      if (action === "delete") setDeleteOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {namedayToday && (
        <div
          className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--accent-gold)]/45 bg-gradient-to-r from-[rgba(201,168,76,0.12)] to-[var(--bg-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--accent-gold)]">Φίλτρο:</span> επαφές που{" "}
            <span className="text-[var(--text-secondary)]">εορτάζουν σήμερα</span> (ονομαστική σύνδεση εορτολογίου).
          </p>
          <button
            type="button"
            onClick={() => {
              router.replace("/contacts", { scroll: false });
            }}
            className={lux.btnSecondary + " !shrink-0 !py-2 text-xs sm:!text-sm"}
          >
            Εμφάνιση όλων
          </button>
        </div>
      )}
      <div className={lux.card}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={lux.pageTitle}>Επαφές</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Διαχείριση εκλογικής βάσης</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className={lux.btnSecondary + " !py-2 text-sm inline-flex items-center gap-1"}
                aria-expanded={exportOpen}
              >
                <Download className="h-4 w-4" />
                Εξαγωγή
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
              {exportOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl"
                  role="menu"
                >
                  {canManage && (
                    <a
                      className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      href="/api/contacts/export"
                    >
                      Εξαγωγή όλων
                    </a>
                  )}
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={`/api/contacts/export?${filterParams(search, callStatus, area, priority, tag, namedayToday, municipality).toString()}`}
                  >
                    Εξαγωγή φίλτρων
                  </a>
                  <a
                    className="block px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                    onClick={(e) => {
                      if (!selectedIds.length) e.preventDefault();
                    }}
                  >
                    Εξαγωγή επιλεγμένων
                  </a>
                </div>
              )}
            </div>
            {canManage && (
              <>
                <a href="/api/contacts/import-template" className={lux.btnSecondary + " !py-2 text-sm"}>
                  CSV Template
                </a>
                <button type="button" onClick={() => setOpenCreate(true)} className={lux.btnPrimary + " !py-2 text-sm"}>
                  <Plus className="h-4 w-4" />
                  Νέα Επαφή
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={lux.card + " !py-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"}>
        <div>
          <label className={lux.label} htmlFor="f-search">Αναζήτηση</label>
          <input
            id="f-search"
            className={lux.input}
            placeholder="Όνομα, τηλέφωνο..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className={lux.label} htmlFor="f-call">Κατάσταση</label>
          <select
            id="f-call"
            className={lux.select}
            value={callStatus}
            onChange={(e) => setCallStatus(e.target.value)}
          >
            <option value="">Όλες</option>
            <option value="Pending">Αναμονή</option>
            <option value="Positive">Θετικός</option>
            <option value="Negative">Αρνητικός</option>
            <option value="No Answer">Δεν απάντησε</option>
          </select>
        </div>
        <div>
          <label className={lux.label} htmlFor="f-area">Περιοχή</label>
          <select id="f-area" className={lux.select} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Όλες</option>
            {areas.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lux.label} htmlFor="f-muni">Δήμος</label>
          <select
            id="f-muni"
            className={lux.select}
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
          >
            <option value="">Όλοι</option>
            {MUNICIPALITIES.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lux.label} htmlFor="f-pri">Προτεραιότητα</label>
          <select
            id="f-pri"
            className={lux.select}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Όλες</option>
            <option value="High">Υψηλή</option>
            <option value="Medium">Μεσαία</option>
            <option value="Low">Χαμηλή</option>
          </select>
        </div>
        <div>
          <label className={lux.label} htmlFor="f-tag">Ετικέτα</label>
          <input id="f-tag" className={lux.input} placeholder="Φίλτρο tag" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
      </div>

      {canManage && <ContactsImportWizard onImported={load} />}

      {contacts.length > 0 && (
        <div className="md:hidden">
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <ContactSwipeCard
                  c={c}
                  onCall={() => void triggerCallById(c.id)}
                  onOpenDetail={() => router.push(`/contacts/${c.id}`)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="data-hq-card hidden overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_4px_24px_rgba(0,0,0,0.4)] md:block">
        <table className="min-w-full text-sm text-[#E2E8F0]">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="sticky left-0 z-20 w-11 min-w-11 max-w-11 border-r border-[var(--border)] bg-[var(--bg-elevated)] p-2 pl-3 text-center sm:w-12">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={allChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (allChecked) setSelected(new Set());
                    else setSelected(new Set(contacts.map((x) => x.id)));
                  }}
                  title="Επιλογή όλων"
                  aria-label="Επιλογή όλων"
                />
              </th>
              <th className="sticky left-11 z-20 min-w-[200px] border-r border-[var(--border)] bg-[var(--bg-elevated)] p-3 pl-2 sm:left-12">
                Όνομα
              </th>
              <th className="p-3">Τηλέφωνο</th>
              <th className="p-3">Περιοχή</th>
              <th className="p-3">Δήμος</th>
              <th className="p-3">Status</th>
              <th className="p-3">Priority</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const st = c.call_status ?? "Pending";
              const pr = c.priority ?? "Medium";
              return (
                <tr
                  key={c.id}
                  className={lux.tableRow}
                  onClick={() => router.push(`/contacts/${c.id}`)}
                >
                  <td
                    className="sticky left-0 z-20 w-11 min-w-11 max-w-11 border-r border-[var(--border)] bg-[var(--bg-card)] p-2 pl-3 text-center sm:w-12"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={selected.has(c.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      aria-label={`Επιλογή ${c.first_name} ${c.last_name}`}
                    />
                  </td>
                  <td
                    className="sticky left-11 z-10 min-w-[200px] border-r border-[var(--border)] bg-[var(--bg-card)] p-3 pl-2 sm:left-12"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 text-left sm:gap-3"
                      onClick={() => router.push(`/contacts/${c.id}`)}
                    >
                      <div className={avatarContact + " !h-8 !w-8 text-[10px] sm:!h-9 sm:!w-9 sm:text-xs"}>
                        {`${(c.first_name[0] ?? "?").toUpperCase()}${(c.last_name[0] ?? "?").toUpperCase()}`}
                      </div>
                      <span className="min-w-0 truncate font-medium text-[#E2E8F0]">
                        {c.first_name} {c.last_name}
                      </span>
                    </button>
                  </td>
                  <td className="p-3 font-mono text-[13px] text-[#94A3B8]">{c.phone}</td>
                  <td className="p-3 text-[#E2E8F0]">{c.area ?? "—"}</td>
                  <td className="p-3 text-[#E2E8F0]">{c.municipality ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium " +
                        (callStatusPill[st] ?? callStatusPill.Pending)
                      }
                    >
                      {callStatusLabel(c.call_status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium " + (priorityPill[pr] ?? priorityPill.Medium)
                      }
                    >
                      {pr === "High" ? "Υψηλή" : pr === "Low" ? "Χαμηλή" : "Μεσαία"}
                    </span>
                  </td>
                  <td className="p-3 pr-4">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={lux.btnIcon} title="Προβολή" onClick={() => router.push(`/contacts/${c.id}`)}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <button type="button" className={lux.btnIcon} title="Κλήση" onClick={(e) => void triggerCall(e, c.id)}>
                        <Phone className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contacts.length === 0 && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Δεν βρέθηκαν επαφές</p>}
      </div>
      {contacts.length === 0 && (
        <p className="p-4 text-center text-sm text-[var(--text-secondary)] md:hidden">Δεν βρέθηκαν επαφές</p>
      )}

      {canManage && (
        <button
          type="button"
          className="no-mobile-scale fixed bottom-24 right-4 z-30 flex h-14 w-14 min-h-14 min-w-14 items-center justify-center rounded-full border-2 border-[#8B6914] text-[#0A1628] shadow-[0_6px_24px_rgba(0,0,0,0.4)] max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:hidden"
          style={{ backgroundColor: "#C9A84C" }}
          onClick={() => setOpenCreate(true)}
          aria-label="Νέα επαφή"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--border)] bg-[rgba(8,16,32,0.95)] p-3 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md md:bottom-4 md:left-1/2 md:right-auto md:w-[min(96%,56rem)] md:-translate-x-1/2 md:rounded-2xl md:border md:px-4">
          {bulkErr && <p className="mb-2 text-center text-xs text-red-300">{bulkErr}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-center text-sm font-medium text-[var(--text-primary)] sm:text-left">
              {selectedIds.length} επαφές επιλεγμένες
            </p>
            <div className="flex flex-1 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
              {canManage && (
                <>
                  <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="bulk-status">Αλλαγή status</label>
                    <select
                      id="bulk-status"
                      className={lux.select + " !h-9 w-full sm:min-w-[11rem]"}
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                    >
                      <option value="Pending">Αναμονή</option>
                      <option value="Positive">Θετικός</option>
                      <option value="Negative">Αρνητικός</option>
                      <option value="No Answer">Δεν απάντησε</option>
                    </select>
                    <button
                      type="button"
                      className={lux.btnPrimary + " w-full !py-2 text-xs sm:w-auto sm:!px-3"}
                      onClick={() => void postBulk("update_status", bulkStatus)}
                      disabled={saving}
                    >
                      Αλλαγή status
                    </button>
                  </div>
                  <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor="bulk-camp">Καμπάνια</label>
                    <select
                      id="bulk-camp"
                      className={lux.select + " !h-9 w-full sm:min-w-[12rem]"}
                      value={bulkCampaign}
                      onChange={(e) => setBulkCampaign(e.target.value)}
                    >
                      <option value="">Ανάθεση σε καμπάνια</option>
                      {campaigns.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={lux.btnSecondary + " w-full !py-2 text-xs sm:w-auto sm:!px-3"}
                      onClick={() => (bulkCampaign ? void postBulk("add_to_campaign", bulkCampaign) : null)}
                      disabled={saving || !bulkCampaign}
                    >
                      Προσθήκη
                    </button>
                  </div>
                </>
              )}
              <a
                className={lux.btnSecondary + " inline-flex w-full !items-center !justify-center gap-2 !py-2.5 sm:w-auto sm:!px-3"}
                href={selectedIds.length ? `/api/contacts/export?${new URLSearchParams({ ids: selectedIds.join(",") }).toString()}` : "#"}
                onClick={(e) => {
                  if (!selectedIds.length) e.preventDefault();
                }}
              >
                <Download className="h-4 w-4" />
                Εξαγωγή
              </a>
              {isAdmin && canManage && (
                <button
                  type="button"
                  className={lux.btnDanger + " w-full !py-2.5 sm:w-auto sm:!px-3"}
                  disabled={saving}
                  onClick={() => setDeleteOpen(true)}
                >
                  Διαγραφή
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteOpen && isAdmin && (
        <div className={lux.modalOverlay}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:mx-0 sm:self-center">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Μαζική διαγραφή</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Να διαγραφούν οριστικά {selectedIds.length} επαφές; Αυτό δεν ανακαλείται.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={lux.btnSecondary} onClick={() => setDeleteOpen(false)} disabled={saving}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnDanger}
                disabled={saving}
                onClick={() => void postBulk("delete", "")}
              >
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}

      {openCreate && <CreateContactModal onClose={() => setOpenCreate(false)} onSaved={load} />}
    </div>
  );
}

function CreateContactModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    area: "",
    age: "",
    gender: "",
    occupation: "",
    source: "",
    political_stance: "",
    municipality: "",
    electoral_district: "",
    toponym: "",
    spouse_name: "",
    nickname: "",
    name_day: "",
    birthday: "",
    priority: "Medium",
    influence: false,
    notes: "",
    tags: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{
    phoneMatch: { id: string; name: string } | null;
    nameMatch: { id: string; name: string } | null;
  } | null>(null);

  const buildPayload = () => ({
    ...form,
    phone: form.phone.trim() || null,
    age: form.age ? Number(form.age) : null,
    tags: form.tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    municipality: form.municipality || null,
    electoral_district: form.electoral_district || null,
    toponym: form.toponym || null,
    spouse_name: form.spouse_name || null,
    nickname: form.nickname || null,
    name_day: form.name_day || null,
    birthday: form.birthday || null,
    call_status: "Pending",
  });

  const postCreate = async () => {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Σφάλμα αποθήκευσης");
    }
    setConflict(null);
    await onSaved();
    onClose();
  };

  const save = async () => {
    setFieldErrors({});
    const err: Record<string, string> = {};
    if (!form.first_name.trim()) err.first_name = "Υποχρεωτικό";
    if (!form.last_name.trim()) err.last_name = "Υποχρεωτικό";
    if (!form.phone.trim()) err.phone = "Υποχρεωτικό";
    if (!form.municipality.trim()) err.municipality = "Υποχρεωτικό";
    if (Object.keys(err).length) {
      setFieldErrors(err);
      return;
    }
    const qs = new URLSearchParams({
      phone: form.phone.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
    });
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/precheck?${qs.toString()}`);
      const j = (await res.json()) as {
        phoneMatch: { id: string; name: string } | null;
        nameMatch: { id: string; name: string } | null;
      };
      if (j.phoneMatch || j.nameMatch) {
        setConflict({ phoneMatch: j.phoneMatch, nameMatch: j.nameMatch });
        return;
      }
      await postCreate();
    } finally {
      setSubmitting(false);
    }
  };

  const onContinueAfterConflict = async () => {
    setSubmitting(true);
    setConflict(null);
    try {
      await postCreate();
    } finally {
      setSubmitting(false);
    }
  };

  const openExistingId = conflict
    ? conflict.phoneMatch?.id ?? conflict.nameMatch?.id
    : null;

  return (
    <>
    <div className={lux.modalOverlay}>
      <div className={lux.modalPanel + " flex max-h-[100dvh] max-w-full flex-col sm:max-h-[90vh] sm:max-w-[680px]"}>
        <div className="mx-auto mt-2 h-1 w-11 shrink-0 rounded-full bg-white/20 md:hidden" role="presentation" />
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Νέα Επαφή</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            aria-label="Κλείσιμο"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Μικρό Όνομα"
              required
              error={fieldErrors.first_name}
              value={form.first_name}
              placeholder="Εισάγετε μικρό όνομα"
              onChange={(v) => setForm({ ...form, first_name: v })}
            />
            <FormField
              label="Επίθετο"
              required
              error={fieldErrors.last_name}
              value={form.last_name}
              placeholder="Εισάγετε επίθετο"
              onChange={(v) => setForm({ ...form, last_name: v })}
            />
            <FormField
              label="Τηλέφωνο"
              required
              error={fieldErrors.phone}
              value={form.phone}
              placeholder="π.χ. 6912345678"
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <div className="md:col-span-2">
              <AitoloakarnaniaLocationFields
                values={{
                  municipality: form.municipality,
                  electoral_district: form.electoral_district,
                  toponym: form.toponym,
                }}
                errorMunicipality={fieldErrors.municipality}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    municipality: v.municipality ?? "",
                    electoral_district: v.electoral_district ?? "",
                    toponym: v.toponym ?? "",
                  }))
                }
              />
            </div>
            <FormField label="Email" value={form.email} placeholder="email@example.com" onChange={(v) => setForm({ ...form, email: v })} />
            <FormField label="Περιοχή" value={form.area} placeholder="Περιοχή / περιφέρεια" onChange={(v) => setForm({ ...form, area: v })} />
            <FormField
              label="Υποκοριστικό"
              value={form.nickname}
              placeholder="Προαιρετικό"
              onChange={(v) => setForm({ ...form, nickname: v })}
            />
            <FormField label="Όνομα συζύγου" value={form.spouse_name} onChange={(v) => setForm({ ...form, spouse_name: v })} />
            <FormField label="Γιορτή" type="date" value={form.name_day} onChange={(v) => setForm({ ...form, name_day: v })} />
            <FormField label="Γενέθλια" type="date" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} />
            <FormField label="Ηλικία" value={form.age} placeholder="Έτη" onChange={(v) => setForm({ ...form, age: v })} />
            <SelectFormField
              label="Φύλο"
              value={form.gender}
              onChange={(v) => setForm({ ...form, gender: v })}
              options={["Άνδρας", "Γυναίκα", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <FormField label="Επάγγελμα" value={form.occupation} onChange={(v) => setForm({ ...form, occupation: v })} />
            <SelectFormField
              label="Πηγή επαφής"
              value={form.source}
              onChange={(v) => setForm({ ...form, source: v })}
              options={["Εκδήλωση", "Παλιός ψηφοφόρος", "Φίλος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Πολιτική τοποθέτηση"
              value={form.political_stance}
              onChange={(v) => setForm({ ...form, political_stance: v })}
              options={["Κεντροδεξιός", "Αριστερός", "Ακροδεξιός", "Αναποφάσιστος", "Άλλο"]}
              allowEmpty
              emptyLabel="Επιλέξτε…"
            />
            <SelectFormField
              label="Προτεραιότητα"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={["High", "Medium", "Low"]}
              valueLabels={{ High: "Υψηλή", Medium: "Μεσαία", Low: "Χαμηλή" }}
            />
            <div>
              <label className={lux.label}>Επιρροή</label>
              <div className="relative">
                <select
                  className={lux.select}
                  value={form.influence ? "Ναι" : "Όχι"}
                  onChange={(e) => setForm({ ...form, influence: e.target.value === "Ναι" })}
                >
                  <option>Όχι</option>
                  <option>Ναι</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Ετικέτες (διαχωρισμός με κόμμα)</label>
              <input
                className={lux.input}
                placeholder="π.χ. τοπική, πεδίο"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={lux.label}>Σημειώσεις</label>
              <textarea
                className={lux.textarea}
                placeholder="Καταγράψτε σημαντικές πληροφορίες..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]/50 px-6 py-4">
          <button type="button" onClick={onClose} className={lux.btnSecondary} disabled={submitting}>
            Ακύρωση
          </button>
          <button type="button" onClick={() => void save()} className={lux.btnPrimary} disabled={submitting}>
            {submitting ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
        </div>
      </div>
    </div>

    {conflict && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[8px]">
        <div className="hq-modal-panel w-full max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
          <h4 className="text-lg font-bold text-[var(--text-primary)]">Πιθανή σύγκρουση</h4>
          {conflict.phoneMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Αυτός ο αριθμός φαίνεται να ανήκει ήδη στον{" "}
              <span className="font-semibold">{conflict.phoneMatch.name}</span>. Διαφορετικό άτομο ή διπλότυπο;
            </p>
          )}
          {conflict.nameMatch && (
            <p className="text-sm text-[var(--text-primary)]">
              Υπάρχει ήδη επαφή με ίδιο όνομα/επίθετο:{" "}
              <span className="font-semibold">{conflict.nameMatch.name}</span>
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={() => setConflict(null)} className={lux.btnSecondary + " w-full sm:w-auto"}>
              Ακύρωση
            </button>
            {openExistingId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/contacts/${openExistingId}`);
                }}
                className={lux.btnGold + " w-full sm:w-auto"}
              >
                Άνοιγμα υπάρχουσας επαφής
              </button>
            )}
            <button
              type="button"
              onClick={() => void onContinueAfterConflict()}
              className={lux.btnPrimary + " w-full sm:w-auto"}
              disabled={submitting}
            >
              Διαφορετικό άτομο — συνέχεια
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function ContactsPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">Φόρτωση…</div>
      }
    >
      <ContactsPage />
    </Suspense>
  );
}

function FormField({
  label,
  value,
  onChange,
  required,
  type,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={lux.label}>
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]">*</span>}
      </label>
      <input
        className={[lux.input, error ? lux.inputError : ""].join(" ")}
        value={value}
        type={type ?? "text"}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function SelectFormField({
  label,
  value,
  onChange,
  options,
  valueLabels,
  allowEmpty,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  valueLabels?: Record<string, string>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <label className={lux.label}>{label}</label>
      <div className="relative">
        <select className={lux.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowEmpty && (
            <option value="">
              {emptyLabel}
            </option>
          )}
          {options.map((o) => (
            <option key={o} value={o}>
              {valueLabels?.[o] ?? o}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    </div>
  );
}

