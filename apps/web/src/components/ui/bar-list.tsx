/**
 * Horizontal bars for one measure. The number is always written next to the bar, so the
 * bar is never the only way to read a value, and a screen reader reads it as a list.
 */
export function BarList({
  label,
  rows,
  format = (value) => String(value),
}: {
  label: string;
  rows: { name: string; value: number; note?: string }[];
  format?: (value: number) => string;
}) {
  const top = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((row) => (
        <li key={row.name} title={`${row.name}: ${format(row.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{row.name}</span>
            <span className="shrink-0 text-muted tabular-nums">
              <span className="font-bold text-fg">{format(row.value)}</span>
              {row.note && ` · ${row.note}`}
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-2 rounded-full bg-overlay">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${(row.value / top) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
