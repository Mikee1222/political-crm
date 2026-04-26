"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  area: string | null;
  call_status: string | null;
  priority: string | null;
  tags: string[] | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [callStatus, setCallStatus] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ search, call_status: callStatus, area, priority, tag });
    const res = await fetchWithTimeout(`/api/contacts?${params.toString()}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
  }, [search, callStatus, area, priority, tag]);

  useEffect(() => {
    load();
  }, [load]);

  const areas = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.area).filter(Boolean))) as string[],
    [contacts],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Επαφές</h1>
        <a href="/api/contacts/import-template" className="rounded-md border px-3 py-2 text-sm">
          CSV Template
        </a>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <input
          className="rounded-md border px-3 py-2"
          placeholder="Αναζήτηση"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-md border px-3 py-2" value={callStatus} onChange={(e) => setCallStatus(e.target.value)}>
          <option value="">Κατάσταση κλήσης</option>
          <option>Pending</option>
          <option>Positive</option>
          <option>Negative</option>
          <option>No Answer</option>
        </select>
        <select className="rounded-md border px-3 py-2" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Περιοχή</option>
          {areas.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select className="rounded-md border px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Προτεραιότητα</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <input
          className="rounded-md border px-3 py-2"
          placeholder="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <CsvImport onImported={load} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-left">Όνομα</th>
              <th className="p-2 text-left">Τηλέφωνο</th>
              <th className="p-2 text-left">Περιοχή</th>
              <th className="p-2 text-left">Call Status</th>
              <th className="p-2 text-left">Priority</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">
                  <Link className="underline" href={`/contacts/${c.id}`}>
                    {c.first_name} {c.last_name}
                  </Link>
                </td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">{c.area ?? "-"}</td>
                <td className="p-2">{c.call_status ?? "-"}</td>
                <td className="p-2">{c.priority ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CsvImport({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);

  const upload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetchWithTimeout("/api/contacts/import", { method: "POST", body: formData });
    onImported();
  };

  return (
    <div className="flex items-center gap-2">
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={upload} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
        Import από CSV
      </button>
    </div>
  );
}
