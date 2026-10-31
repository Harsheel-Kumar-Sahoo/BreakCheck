"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectNav from "@/components/ProjectNav";

type Item = { id: string; type: string; text: string; at: string; live?: boolean };

const TONE = (t: string) =>
  t.includes("failed") || t.includes("invalid") || t.includes("conflict") ? "bg-red-500"
  : t.includes("duplicate") ? "bg-amber-400"
  : t.includes("completed") || t.includes("ingested") ? "bg-green-500" : "bg-indigo-400";

const TEXT: Record<string, (p: any) => string> = {
  "spec.ingested": (p) => `Spec ${p.versionLabel} ingested`,
  "spec.duplicate_ignored": (p) => `Duplicate upload ignored (${p.versionLabel} matches ${p.existingLabel})`,
  "spec.invalid": (p) => `Invalid spec rejected (${p.errorCount} problem(s))`,
  "spec.label_conflict": (p) => `Label ${p.versionLabel} already used`,
  "diff.computed": (p) => `Diff ${p.from} → ${p.to}: ${p.total} changes`,
  "run.completed": (p) => `Run completed: ${String(p.verdict).replaceAll("_", " ")}, ${p.tasks} tasks`,
  "run.failed": (p) => `Run failed: ${p.error}`,
  "task.updated": (p) => `Task ${p.status}: ${p.consumer}`,
  "consumers.imported": (p) => `${p.saved} consumer(s) imported`,
  "webhook.duplicate_ignored": (p) => `Webhook retry ignored (event ${p.eventId})`,
  "webhook.received": (p) => `Webhook received (event ${p.eventId})`,
};

export default function ActivityPage() {
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<Item[] | null>(null);
  const [connected, setConnected] = useState(false);
  const projectId = useRef("");

  useEffect(() => {
    let es: EventSource | undefined;
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/projects/${slug}/events`);
      if (!r.ok || cancelled) return;
      const j = await r.json();
      projectId.current = j.projectId;
      setItems(j.events.map((e: any) => ({
        id: e._id, type: e.type, text: (TEXT[e.type]?.(e.payload ?? {}) ?? e.type), at: e.receivedAt,
      })));
      es = new EventSource("/api/live");
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.projectId !== projectId.current) return; // other projects' events are not ours
        setItems((cur) => (cur?.some((i) => i.id === m.id) ? cur : [{ id: m.id, type: m.type, text: m.text, at: m.at, live: true }, ...(cur ?? [])].slice(0, 100)));
      };
    })();
    return () => { cancelled = true; es?.close(); };
  }, [slug]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Activity · {slug}</h1>
      <ProjectNav slug={slug} current="activity" />
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-slate-300"}`} />
        {connected ? "Live: updates appear as they happen" : "Connecting…"}
      </div>

      {items === null && <div className="h-24 animate-pulse rounded-xl bg-slate-200" />}
      {items?.length === 0 && <p className="text-slate-500">No activity yet.</p>}
      <ul className="space-y-2">
        {items?.map((i) => (
          <li key={i.id} className={`flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm ${i.live ? "border-indigo-300" : "border-slate-200"}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE(i.type)}`} />
            <div className="flex-1">
              <div className="text-sm">{i.text}</div>
              <div className="text-xs text-slate-500">{new Date(i.at).toLocaleString()} · {i.type}</div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}