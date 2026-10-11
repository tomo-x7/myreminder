const W = 240;
const H = 48;
const PAD = 5;

/** 比率の推移の折れ線。破線が 1.0 倍(見積もりどおり)。データのない週は線をつながない */
export function Sparkline({ values, label }: { values: readonly (number | null)[]; label: string }) {
	const present = values.filter((v): v is number => v !== null);
	if (present.length === 0) return null;
	const lo = Math.min(1, ...present);
	const hi = Math.max(1, ...present);
	const span = hi - lo || 1;
	const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(1, values.length - 1);
	const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD);

	const segments: [number, number][][] = [];
	let current: [number, number][] = [];
	values.forEach((v, i) => {
		if (v === null) {
			if (current.length > 0) segments.push(current);
			current = [];
		} else current.push([x(i), y(v)]);
	});
	if (current.length > 0) segments.push(current);

	const lastIndex = values.length - 1;
	const last = values[lastIndex];
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-60 max-w-full" role="img" aria-label={label}>
			<line x1={PAD} x2={W - PAD} y1={y(1)} y2={y(1)} className="stroke-faint" strokeDasharray="3 3" />
			{segments.map((seg) =>
				seg.length > 1 ? (
					<polyline
						key={seg[0]?.[0]}
						points={seg.map(([px, py]) => `${px},${py}`).join(" ")}
						fill="none"
						className="stroke-ink"
						strokeWidth={1.5}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				) : null,
			)}
			{values.map((v, i) =>
				v === null ? null : (
					<circle
						key={i}
						cx={x(i)}
						cy={y(v)}
						r={i === lastIndex && last !== null ? 3 : 2}
						className="fill-ink"
					/>
				),
			)}
		</svg>
	);
}
