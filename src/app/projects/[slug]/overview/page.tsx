"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ProjectNav from "@/components/ProjectNav";
import VerdictBanner from "@/components/VerdictBanner";

type Stats = {
  risk: { _id: string; name: string; breaking: number; potential: number; open: number; releases: number; score: number }[];
  trend: { release: string; breaking: number; potential: number; safe: number }[];
  tiles: { versions: number; consumers: number; openTasks: number };
  latest: { verdict: string; reason?: string } | null;
};

export default function OverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { fetch(`/api/projects/${slug}/stats`).then((r) => r.json()).then(setS); }, [slug]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Overview · {slug}</h1>
      <ProjectNav slug={slug} current="overview" />
      {!s && <div className="h-32 animate-pulse rounded-xl bg-slate-200" />}
      {s && (
        <>
          {s.latest ? <VerdictBanner verdict={s.latest.verdict} reason={s.latest.reason} />
            : <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">No analysis yet. Open <b>Impact</b> and click <b>Who breaks?</b></p>}

          <div className="grid grid-cols-3 gap-3">
            {([["Versions", s.tiles.versions], ["Consumers", s.tiles.consumers], ["Open tasks", s.tiles.openTasks]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-semibold">{v}</div><div className="text-sm text-slate-600">{l}</div>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Changes per release</h2>
            {s.trend.length === 0 ? <p className="text-slate-500">Run an analysis to see the trend.</p> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="release" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                    <Bar dataKey="breaking" fill="#ef4444" name="Breaking" />
                    <Bar dataKey="potential" fill="#f59e0b" name="Potential" />
                    <Bar dataKey="safe" fill="#22c55e" name="Safe" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Consumer risk ranking</h2>
            {s.risk.length === 0 ? <p className="text-slate-500">No tasks yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Consumer</th><th>Breaking</th><th>Potential</th><th>Open</th><th>Releases</th><th>Score</th></tr></thead>
                <tbody>
                  {s.risk.map((r) => (
                    <tr key={r._id} className="border-t border-slate-100">
                      <td className="py-1 font-medium">{r.name}</td><td className="text-red-700">{r.breaking}</td>
                      <td className="text-amber-700">{r.potential}</td><td>{r.open}</td><td>{r.releases}</td><td className="font-semibold">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-slate-500">Score = 3 × breaking + 1 × potential, over the latest analysis of each release.</p>
          </section>
        </>
      )}
    </main>
  );
}