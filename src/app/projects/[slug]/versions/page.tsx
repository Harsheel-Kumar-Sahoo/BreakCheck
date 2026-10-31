"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

type Issue = { path: string; message: string; line?: number; column?: number };
type Version = { _id: string; versionLabel: string; checksum?: string; status: "ingested" | "invalid"; createdAt: string };
type Result = {
  kind: "created" | "duplicate" | "invalid" | "label_conflict" | "bad_request";
  message?: string; errors?: Issue[]; version?: Version;
};

const banner: Record<Result["kind"], { cls: string; title: string }> = {
  created:        { cls: "border-green-300 bg-green-50 text-green-900", title: "Version ingested" },
  duplicate:      { cls: "border-amber-300 bg-amber-50 text-amber-900", title: "Already ingested. Showing the existing version." },
  invalid:        { cls: "border-red-300 bg-red-50 text-red-900", title: "Invalid spec. Nothing was ingested." },
  label_conflict: { cls: "border-red-300 bg-red-50 text-red-900", title: "Label already used" },
  bad_request:    { cls: "border-red-300 bg-red-50 text-red-900", title: "Incomplete input" },
};

export default function VersionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${slug}/versions`);
    if (r.ok) setVersions((await r.json()).versions);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    setFileName(file.name);
    if (!label) setLabel(file.name.replace(/^orders-/, "").replace(/\.(ya?ml|json)$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`/api/projects/${slug}/versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionLabel: label, text }),
      });
      setResult(await r.json());
      load();
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/" className="text-sm text-indigo-600">← Projects</Link>
      <h1 className="text-2xl font-semibold">Versions · {slug}</h1>
      <ProjectNav slug={slug} current="versions" />   {/* use current="diff" in the diff page */}
      <Link href={`/projects/${slug}/diff`} className="inline-block text-sm text-indigo-600">Compare versions →</Link>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
          className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-600"
        >
          Drag a .yaml / .json spec here, or{" "}
          <label className="cursor-pointer text-indigo-600 underline">
            browse
            <input type="file" accept=".yaml,.yml,.json" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          {fileName && <div className="mt-1 font-medium text-slate-800">{fileName}</div>}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="…or paste the spec here"
          className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version label, e.g. v1"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      {result && (
        <div role="alert" className={`rounded-xl border p-4 ${banner[result.kind].cls}`}>
          <div className="font-medium">{banner[result.kind].title}</div>
          {result.message && <p className="mt-1 text-sm">{result.message}</p>}
          {result.version && result.kind !== "invalid" && (
            <p className="mt-1 text-sm">Version <b>{result.version.versionLabel}</b> {result.version.checksum && <>· checksum <code>{result.version.checksum.slice(0, 12)}…</code></>}</p>
          )}
          {result.errors && (
            <ul className="mt-2 space-y-1 text-sm">
              {result.errors.map((er, i) => (
                <li key={i}>
                  <code className="rounded bg-red-100 px-1">{er.path}{er.line ? ` (line ${er.line}${er.column ? `, col ${er.column}` : ""})` : ""}</code>{" "}
                  {er.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Timeline</h2>
        {versions === null && <p className="text-slate-500">Loading…</p>}
        {versions?.length === 0 && <p className="text-slate-500">No versions yet. Upload your first spec above.</p>}
        {versions?.map((v) => (
          <div key={v._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <div className="font-medium">{v.versionLabel}</div>
              <div className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()} · <code>{v.checksum?.slice(0, 10)}</code></div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.status === "ingested" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {v.status}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}