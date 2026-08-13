export function BarChartCA({ data }: { data: { label: string; valeur: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.valeur));

  return (
    <div className="flex h-32 items-stretch gap-1">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-full w-full flex-col justify-end" title={`${d.valeur.toLocaleString("fr-FR")} F`}>
            <div
              className="w-full rounded-t-[3px] bg-orange"
              style={{ height: `${d.valeur > 0 ? Math.max(3, (d.valeur / max) * 100) : 0}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[.6rem] text-ink-soft">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
