import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="BreakCheck home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">BC</span>
          <span className="font-semibold text-slate-900">BreakCheck</span>
        </Link>
        <div className="hidden text-right text-xs leading-tight text-slate-600 sm:block">
          <div className="font-medium text-slate-800">Team Almost Avengers · SVNIT</div>
          <div>NEXUS UNCHARTED · MongoDB Student Hackathon</div>
        </div>
      </div>
    </header>
  );
}