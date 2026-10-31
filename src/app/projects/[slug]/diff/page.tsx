"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

type Sev = "breaking" | "potential" | "safe";
type Version = { _id: string; versionLabel: string; status: string };
type Change = {
  _id: string; changeType: string; severity: Sev; title: string; elementKey: string;
  kind: string; before?: Record<string, unknown>; after?: Record<string, unknown>; detail?: Record<string, unknown>;
};

const SEV: Record<Sev, { label: string; badge: string; tile: string }> = {
  breaking: { label: "Breaking", badge: "bg-red-100 text-red-800", tile: "border-red-200" },
  potential: { label: "Potentially breaking", badge: "bg-amber-100 text-amber-800", tile: "border-amber-200" },
  safe: { label: "Safe", badge: "bg-green-100 text-green-800", tile: "border-green-200" },
};

const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

// Turns before/after attributes into "-" and "+" lines, like a code diff.
function diffLines(c: Change): { sign: "-" | "+"; text: string }[] {
  const b = c.before, a = c.after;
  if ((c.kind === "operation" || c.kind === "response") && (!b || !a)) return [{ sign: b ? "-" : "+", text: c.elementKey }];
  const summ = (x: Record<string, unknown>) =>
    Object.entries(x).filter(([k, v]) => k !== "description" && v !== undefined).map(([k, v]) => `${k}: ${fmt(v)}`).join(", ") || "(exists)";
  if (!b && a) return [{ sign: "+", text: summ(a) }];
  if (b && !a) return [{ sign: "-", text: summ(b) }];
  const lines: { sign: "-" | "+"; text: string }[] = [];
  for (const k of new Set([...Object.keys(b!), ...Object.keys(a!)])) {
    if (JSON.stringify(b![k]) === JSON.stringify(a![k])) continue;
    if (b![k] !== undefined) lines.push({ sign: "-", text: `${k}: ${fmt(b![k])}` });
    if (a![k] !== undefined) lines.push({ sign: "+", text: `${k}: ${fmt(a![k])}` });
  }
  return lines;
}

export default function DiffPage() {
  const { slug } = useParams<{ slug: string }>();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [data, setData] = useState<{ changes: Change[]; summary: Record<Sev, number> } | null>(null);
  const [show, setShow] = useState<Record<Sev, boolean>>({ breaking: true, potential: true, safe: true });
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/projects/${slug}/versions`);
      if (!r.ok) return;
      const list: Version[] = (await r.json()).versions.filter((v: Version) => v.status === "ingested");
      setVersions(list); // newest first
      if (list.length >= 2) { setTo(list[0]._id); setFrom(list[1]._id); }
    })();
  }, [slug]);

  async function compare() {
    setBusy(true); setError(null); setNote(null); setData(null);
    try {
      const p = await fetch(`/api/projects/${slug}/diff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersionId: from, toVersionId: to }),
      });
      const pj = await p.json();
      if (!p.ok) return setError(pj.error);
      setNote(`${pj.fromLabel} → ${pj.toLabel}: ${pj.total} changes found. ${pj.created} newly saved, ${pj.existing} already existed (no duplicates created).`);
      const g = await fetch(`/api/projects/${slug}/diff?from=${from}&to=${to}`);
      setData(await g.json());
    } finally { setBusy(false); }
  }

  const grouped = useMemo(() => {
    const out: Record<Sev, Change[]> = { breaking: [], potential: [], safe: [] };
    for (const c of data?.changes ?? []) if (c.elementKey.toLowerCase().includes(q.toLowerCase())) out[c.severity].push(c);
    return out;
  }, [data, q]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex justify-between text-sm">
        <Link href="/" className="text-indigo-600">← Projects</Link>
        <Link href={`/projects/${slug}/versions`} className="text-indigo-600">Versions</Link>
      </div>
      <h1 className="text-2xl font-semibold">Diff · {slug}</h1>
      <ProjectNav slug={slug} current="versions" />   {/* use current="diff" in the diff page */}

      {versions === null && <p className="text-slate-500">Loading…</p>}
      {versions && versions.length < 2 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">Upload at least two valid versions to compare them.</p>}

      {versions && versions.length >= 2 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {([["From", from, setFrom], ["To", to, setTo]] as const).map(([label, val, set]) => (
            <label key={label} className="text-sm">
              <span className="mb-1 block text-slate-600">{label}</span>
              <select value={val} onChange={(e) => set(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                {versions.map((v) => <option key={v._id} value={v._id}>{v.versionLabel}</option>)}
              </select>
            </label>
          ))}
          <button onClick={compare} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Comparing…" : "Compare"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {note && <p className="text-sm text-slate-600">{note}</p>}
      {busy && <div className="h-24 animate-pulse rounded-xl bg-slate-200" />}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(SEV) as Sev[]).map((s) => (
              <button key={s} onClick={() => setShow({ ...show, [s]: !show[s] })} aria-pressed={show[s]}
                className={`rounded-xl border bg-white p-4 text-left shadow-sm ${SEV[s].tile} ${show[s] ? "" : "opacity-40"}`}>
                <div className="text-2xl font-semibold">{data.summary[s]}</div>
                <div className="text-sm text-slate-600">{SEV[s].label}</div>
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by endpoint or field, e.g. /orders/{id} or total"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />

          {data.changes.length === 0 && <p className="text-slate-500">No differences between these versions.</p>}

          {(Object.keys(SEV) as Sev[]).filter((s) => show[s] && grouped[s].length > 0).map((s) => (
            <section key={s} className="space-y-2">
              <h2 className="font-medium">{SEV[s].label} ({grouped[s].length})</h2>
              {grouped[s].map((c) => (
                <div key={c._id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV[c.severity].badge}`}>{SEV[c.severity].label}</span>
                    <span className="font-medium">{c.title}</span>
                  </div>
                  <code className="mt-1 block break-all text-xs text-slate-500">{c.elementKey}</code>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">
                    {diffLines(c).map((l, i) => (
                      <div key={i} className={l.sign === "-" ? "text-red-700" : "text-green-700"}>{l.sign} {l.text}</div>
                    ))}
                  </pre>
                  {c.detail && Object.keys(c.detail).length > 0 && <div className="mt-1 text-xs text-slate-500">{fmt(c.detail)}</div>}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </main>
  );
}