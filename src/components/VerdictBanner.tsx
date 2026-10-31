const V: Record<string, { cls: string; title: string }> = {
  do_not_ship:       { cls: "border-red-300 bg-red-50 text-red-900", title: "Do not ship" },
  ship_with_caution: { cls: "border-amber-300 bg-amber-50 text-amber-900", title: "Ship with caution" },
  safe_to_ship:      { cls: "border-green-300 bg-green-50 text-green-900", title: "Safe to ship" },
};

export default function VerdictBanner({ verdict, reason }: { verdict?: string; reason?: string }) {
  const v = verdict ? V[verdict] : undefined;
  if (!v) return null;
  return (
    <div role="status" className={`rounded-xl border p-4 ${v.cls}`}>
      <div className="text-lg font-semibold">{v.title}</div>
      {reason && <div className="text-sm">{reason}</div>}
    </div>
  );
}