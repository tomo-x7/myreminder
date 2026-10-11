import { sparkline } from "core/domain/review-view";

const W = 240;
const H = 48;
const PAD = 5;

/** 比率の推移の折れ線。破線が 1.0 倍(見積もりどおり)。データのない週は線をつながない */
export function Sparkline({ values, label }: { values: readonly (number | null)[]; label: string }) {
	const line = sparkline(values, { width: W, height: H, pad: PAD });
	if (line === null) return null;
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-60 max-w-full" role="img" aria-label={label}>
			<line
				x1={PAD}
				x2={W - PAD}
				y1={line.baseline}
				y2={line.baseline}
				className="stroke-faint"
				strokeDasharray="3 3"
			/>
			{line.segments.map((seg) =>
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
			{line.points.map((p) => (
				<circle key={p.x} cx={p.x} cy={p.y} r={p.last ? 3 : 2} className="fill-ink" />
			))}
		</svg>
	);
}
