import { Suspense } from "react";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-6"><div className="h-32 animate-pulse rounded-xl bg-slate-200" /></div>}>
      {children}
    </Suspense>
  );
}