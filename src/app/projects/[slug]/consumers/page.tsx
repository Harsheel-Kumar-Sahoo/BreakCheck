"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProjectNav from "@/components/ProjectNav";

type Usage = { method: string; path: string; params: string[]; requestFields: string[]; responseFields: string[] };
type Consumer = { _id: string; name: string; owner: string; repo: string; usages: Usage[] };

const TEMPLATE = JSON.stringify([{ method: "GET", path: "/orders", params: [], requestFields: [], responseFields: ["id"] }], null, 2);

export default function ConsumersPage() {
  const { slug } = useParams<{ slug: string }>();
  const [list, setList] = useState<Consumer[] | null>(null);
  const [importText, setImportText] = useState("");
  const [form, setForm] = useState({ name: "", owner: "", repo: "", usages: TEMPLATE });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; warnings: string[] } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${slug}/consumers`);
    if (r.ok) setList((await r.json()).consumers);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  async function save(payload: unknown) {
    const r = await fetch(`/api/projects/${slug}/consumers`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consumers: payload }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error, warnings: j.warnings ?? [] });
    setMsg({ ok: true, text: `Saved ${j.saved} consumer(s).`, warnings: j.warnings });
    load();
  }

  function parseOrFail(text: string): unknown | undefined {
    try { return JSON.parse(text); } catch (e: any) {
      setMsg({ ok: false, text: `That is not valid JSON: ${e.message}`, warnings: [] });
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Consumers · {slug}</h1>
      <ProjectNav slug={slug} current="consumers" />

      {msg && (
        <div role="alert" className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {msg.text}
          {msg.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-900">{msg.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </div>
      )}

      <section className="space-y-2">
        {list === null && <p className="text-slate-500">Loading…</p>}
        {list?.length === 0 && <p className="text-slate-500">No consumers yet. Import some below.</p>}
        {list?.map((c) => (
          <div key={c._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex justify-between">
              <div><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.owner} · {c.repo}</div></div>
              <button className="text-sm text-indigo-600" onClick={() => setForm({ name: c.name, owner: c.owner, repo: c.repo, usages: JSON.stringify(c.usages, null, 2) })}>Edit</button>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {c.usages.map((u, i) => (
                <li key={i}><code>{u.method} {u.path}</code> reads [{u.responseFields.join(", ")}] sends [{[...u.params, ...u.requestFields].join(", ")}]</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <form onSubmit={(e) => { e.preventDefault(); const u = parseOrFail(form.usages); if (u !== undefined) save([{ ...form, usages: u }]); }}
        className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium">Add or edit one consumer</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["name", "owner", "repo"] as const).map((k) => (
            <input key={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={k}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          ))}
        </div>
        <textarea value={form.usages} onChange={(e) => setForm({ ...form, usages: e.target.value })} rows={6} aria-label="Usages as JSON"
          className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">Save consumer</button>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); const j = parseOrFail(importText); if (j !== undefined) save(j); }}
        className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium">Import JSON</h2>
        <input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImportText(await f.text()); }} />
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} placeholder="Paste a JSON array of consumers"
          className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-white hover:bg-slate-900">Import</button>
      </form>
    </main>
  );
}