"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Project = { _id: string; name: string; slug: string; createdAt: string };

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/projects");
    setProjects(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setName("");
    load();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">NEXUS UNCHARTED</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">MongoDB Student Hackathon</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Track 3 · Developer Tools</span>
        </div>
        <h1 className="text-3xl font-semibold">BreakCheck</h1>
        <p className="text-slate-600">If I ship this API version, who breaks?</p>
        <p className="text-sm text-slate-500">Team Almost Avengers · SVNIT</p>
      </section>

      <form onSubmit={create} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">Create</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        {projects === null && <p className="text-slate-500">Loading…</p>}
        {projects?.length === 0 && <p className="text-slate-500">No projects yet. Create one above.</p>}
        {projects?.map((p) => (
          <Link key={p._id} href={`/projects/${p.slug}/versions`}
            className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-slate-500">{p.slug} · created {new Date(p.createdAt).toLocaleString()}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}