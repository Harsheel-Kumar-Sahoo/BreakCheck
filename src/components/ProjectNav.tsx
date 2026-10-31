import Link from "next/link";

const items = [["overview", "Overview"], ["versions", "Versions"], ["diff", "Diff"], ["impact", "Impact"], ["tasks", "Tasks"], ["activity", "Activity"], ["consumers", "Consumers"]] as const;

export default function ProjectNav({ slug, current }: { slug: string; current: string }) {
  return (
    <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm" aria-label="Project">
      {items.map(([path, label]) => (
        <Link key={path} href={`/projects/${slug}/${path}`}
          className={`rounded-lg px-3 py-1.5 ${current === path ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}