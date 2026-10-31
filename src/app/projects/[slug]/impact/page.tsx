"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProjectNav from "@/components/ProjectNav";
import VerdictBanner from "@/components/VerdictBanner";
import type { ImpactReport, ChangeCol, ConsumerImpact } from "@/lib/impact/analyze";

type Version = { _id: string; versionLabel: string; status: string };
type Sev = "breaking" | "potential";

const CELL: Record<Sev, string> = { breaking: "bg-red-500", potential: "bg-amber-400" };
const BADGE: Record<Sev, string> = { breaking: "bg-red-100 text-red-800", potential: "bg-amber-100 text-amber-800" };

function why(consumer: string, c: ChangeCol): string {
  const ep = `${c.method} ${c.path}`;
  if (c.impact === "operation") return `${consumer} calls ${ep}, and this change affects the whole endpoint.`;
  if (c.impact === "missing") return `${consumer} calls ${ep} but does not send "${c.target}", which is now required.`;
  return `${consumer} uses "${c.target}" on ${ep}.`;
}

export default function ImpactPage() {
  const { slug } = useParams<{ slug: string }>();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [run, setRun] = useState<{ verdict: string; reason: string } | null>(null);
  const [sel, setSel] = useState<{ consumer: ConsumerImpact; change: ChangeCol } | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/projects/${slug}/versions`);
      if (!r.ok) return;
      const list: Version[] = (await r.json()).versions.filter((v: Version) => v.status === "ingested");
      setVersions(list);
      if (list.length >= 2) { setTo(list[0]._id); setFrom(list[1]._id); }
    })();
  }, [slug]);

  async function analyze(simulateFailure = false) {
    setBusy(true); setError(null); setReport(null); setSel(null); setRun(null);
    try {
      // One call does everything: diff, impact join, tasks, verdict, and records the run.
      const r = await fetch(`/api/projects/${slug}/runs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersionId: from, toVersionId: to, simulateFailure }),
      });
      const j = await r.json();
      if (!j.ok) return setError(j.run ? `The analysis failed and was recorded as a failed run: ${j.error}` : j.error);
      setReport(j.report);
      setRun(j.run);
    } finally { setBusy(false); }
  }

  const s = report?.summary;
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Impact · {slug}</h1>
      <ProjectNav slug={slug} current="impact" />

      {versions && versions.length < 2 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">Upload at least two valid versions first.</p>}
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
          <button onClick={() => analyze()} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Analysing…" : "Who breaks?"}
          </button>
          <button onClick={() => analyze(true)} disabled={busy} className="text-xs text-slate-500 underline">
            Simulate failed run (demo)
          </button>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {busy && <div className="h-32 animate-pulse rounded-xl bg-slate-200" />}

      {report && s && (
        <>
          {run && <VerdictBanner verdict={run.verdict} reason={run.reason} />}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Affected consumers", `${s.affectedConsumers} / ${s.totalConsumers}`],
              ["Breaking changes", String(s.breakingChanges)],
              ["Breaking hits", String(s.breakingHits)],
              ["Breaking, nobody uses", String(s.breakingNobodyUses)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-semibold">{val}</div>
                <div className="text-sm text-slate-600">{label}</div>
              </div>
            ))}
          </div>

          {report.consumers.length === 0 && <p className="text-slate-500">No consumers yet. Add some on the Consumers page.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {report.consumers.map((c) => (
              <div key={c._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">{c.owner} · {c.repo}</div>
                <div className="mt-2 text-sm">
                  {c.breaking + c.potential === 0
                    ? <span className="text-green-700">Not affected by this release</span>
                    : <><b className="text-red-700">{c.breaking} breaking</b>, <b className="text-amber-700">{c.potential} potential</b></>}
                </div>
              </div>
            ))}
          </div>

          {report.columns.length === 0 ? (
            <p className="text-slate-500">No breaking or potentially breaking changes in this release.</p>
          ) : (
            <section className="space-y-2">
              <h2 className="font-medium">Impact matrix</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white p-2 text-left">Consumer</th>
                      {report.columns.map((c) => (
                        <th key={c._id} className="min-w-[110px] p-2 text-left align-bottom font-normal" title={c.elementKey}>
                          <div className="font-medium">{c.method} {c.path}</div>
                          <div className="text-slate-500">{c.target ?? c.changeType}</div>
                          <span className={`mt-1 inline-block rounded-full px-1.5 ${BADGE[c.severity]}`}>{c.severity}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.consumers.map((cons) => (
                      <tr key={cons._id} className="border-t border-slate-100">
                        <th className="sticky left-0 bg-white p-2 text-left font-medium">{cons.name}</th>
                        {report.columns.map((col) => {
                          const sev = cons.hits[col._id];
                          return (
                            <td key={col._id} className="p-2">
                              {sev ? (
                                <button onClick={() => setSel({ consumer: cons, change: col })}
                                  aria-label={`${cons.name}: ${sev} - ${col.title}`}
                                  className={`h-5 w-full rounded ${CELL[sev]} focus:outline-2 focus:outline-indigo-600`} />
                              ) : <div className="h-5 w-full rounded bg-slate-100" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sel && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[sel.change.severity]}`}>{sel.change.severity}</span>
                <b>{sel.change.title}</b>
              </div>
              <p className="mt-1">{why(sel.consumer.name, sel.change)}</p>
              <code className="mt-1 block break-all text-xs text-slate-500">{sel.change.elementKey}</code>
            </div>
          )}
        </>
      )}
    </main>
  );
}