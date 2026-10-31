"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectNav from "@/components/ProjectNav";

type Item = { id: string; type: string; text: string; at: string; live?: boolean };
type Mode = "connecting" | "live" | "polling";

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
  const [mode, setMode] = useState<Mode>("connecting");
  const projectId = useRef("");
  const modeRef = useRef<Mode>("connecting");
  const setBoth = (m: Mode) => { modeRef.current = m; setMode(m); };

  const fetchEvents = useCallback(async () => {
    const r = await fetch(`/api/projects/${slug}/events`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    projectId.current = j.projectId;
    setItems((cur) => {
      const liveIds = new Set((cur ?? []).filter((i) => i.live).map((i) => i.id));
      return j.events.map((e: any) => ({
        id: e._id, type: e.type, text: TEXT[e.type]?.(e.payload ?? {}) ?? e.type, at: e.receivedAt, live: liveIds.has(e._id),
      }));
    });
  }, [slug]);

  useEffect(() => {
    let es: EventSource | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const startPolling = () => {
      if (poll || cancelled) return;
      setBoth("polling");
      poll = setInterval(fetchEvents, 5000);
    };

    (async () => {
      await fetchEvents();
      if (cancelled) return;
      es = new EventSource("/api/live");
      es.onopen = () => {
        if (poll) { clearInterval(poll); poll = undefined; }
        setBoth("live");
      };
      es.onerror = () => { if (modeRef.current !== "live") startPolling(); else setBoth("connecting"); };
      es.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.projectId !== projectId.current) return;
        setItems((cur) => (cur?.some((i) => i.id === m.id) ? cur : [{ id: m.id, type: m.type, text: m.text, at: m.at, live: true }, ...(cur ?? [])].slice(0, 100)));
      };
      // If SSE has not connected within 4 seconds, assume serverless and poll instead.
      fallback = setTimeout(() => { if (modeRef.current === "connecting") startPolling(); }, 4000);
    })();

    return () => { cancelled = true; es?.close(); if (poll) clearInterval(poll); if (fallback) clearTimeout(fallback); };
  }, [fetchEvents]);

  const status = {
    connecting: { dot: "bg-slate-300", text: "Connecting…" },
    live: { dot: "bg-green-500", text: "Live: change stream pushes updates as they happen" },
    polling: { dot: "bg-amber-400", text: "Polling every 5 seconds (live stream unavailable on this host)" },
  }[mode];

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Activity · {slug}</h1>
      <ProjectNav slug={slug} current="activity" />
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.text}
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