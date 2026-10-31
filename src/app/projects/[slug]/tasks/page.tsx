"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectNav from "@/components/ProjectNav";
import VerdictBanner from "@/components/VerdictBanner";

type Status = "todo" | "in_progress" | "done";
type Task = { _id: string; consumerName: string; severity: "breaking" | "potential"; title: string; hint: string; status: Status };
type RunInfo = { _id: string; label: string; verdict?: string; startedAt: string };

const BADGE = { breaking: "bg-red-100 text-red-800", potential: "bg-amber-100 text-amber-800" };

export default function TasksPage() {
  const { slug } = useParams<{ slug: string }>();
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
  const [runId, setRunId] = useState("");
  const [verdict, setVerdict] = useState<string | undefined>();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async (id?: string) => {
    const r = await fetch(`/api/projects/${slug}/tasks${id ? `?runId=${id}` : ""}`);
    if (!r.ok) return setError("Could not load tasks.");
    const j = await r.json();
    setRuns(j.runs); setRunId(j.run?._id ?? ""); setVerdict(j.run?.verdict); setTasks(j.tasks);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: Status) {
    const prev = tasks;
    setError(null);
    setTasks((ts) => ts!.map((t) => (t._id === id ? { ...t, status } : t))); // optimistic
    const r = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!r.ok) { setTasks(prev); setError("Could not save that change, so it was reverted."); }
  }

  const groups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks ?? []) m.set(t.consumerName, [...(m.get(t.consumerName) ?? []), t]);
    return [...m.entries()];
  }, [tasks]);

  async function copyMd(name: string, list: Task[]) {
    const md = `### ${name}\n` + list.map((t) => `- [${t.status === "done" ? "x" : " "}] **${t.severity}**: ${t.title}${t.hint ? ` (${t.hint})` : ""}`).join("\n");
    await navigator.clipboard.writeText(md);
    setCopied(name); setTimeout(() => setCopied(""), 1500);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Tasks · {slug}</h1>
      <ProjectNav slug={slug} current="tasks" />

      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {runs === null && <div className="h-24 animate-pulse rounded-xl bg-slate-200" />}
      {runs?.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">No completed analysis yet. Open <b>Impact</b> and click <b>Who breaks?</b></p>}

      {runs && runs.length > 0 && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Analysis run</span>
          <select value={runId} onChange={(e) => load(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
            {runs.map((r) => <option key={r._id} value={r._id}>{r.label} · {new Date(r.startedAt).toLocaleString()}</option>)}
          </select>
        </label>
      )}

      <VerdictBanner verdict={verdict} />
      {tasks?.length === 0 && runs && runs.length > 0 && <p className="text-slate-500">This run produced no tasks. Nobody is affected.</p>}

      {groups.map(([name, list]) => {
        const done = list.filter((t) => t.status === "done").length;
        return (
          <section key={name} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{name} <span className="text-sm font-normal text-slate-500">{done}/{list.length} done</span></h2>
              <button onClick={() => copyMd(name, list)} className="text-sm text-indigo-600">{copied === name ? "Copied!" : "Copy as markdown"}</button>
            </div>
            {list.map((t) => (
              <div key={t._id} className="flex items-start gap-3 border-t border-slate-100 pt-2">
                <input type="checkbox" checked={t.status === "done"} aria-label={`Mark done: ${t.title}`} className="mt-1 h-4 w-4"
                  onChange={(e) => setStatus(t._id, e.target.checked ? "done" : "todo")} />
                <div className="flex-1">
                  <div className={t.status === "done" ? "text-slate-400 line-through" : ""}>
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[t.severity]}`}>{t.severity}</span>
                    {t.title}
                  </div>
                  <div className="text-xs text-slate-500">{t.hint}</div>
                </div>
                <select value={t.status} onChange={(e) => setStatus(t._id, e.target.value as Status)} aria-label="Task status"
                  className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs">
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}