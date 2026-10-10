// PWA アイコン(チェックマーク)を public/icons に書き出す。依存なし(node の zlib だけで PNG を作る)。
// 実行: node web/scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const BG = [0x4f, 0x46, 0xe5]; // indigo-600。manifest の theme_color と合わせる
const FG = [0xff, 0xff, 0xff];
const SS = 4; // 1画素あたり SS×SS のサンプルで縁を滑らかにする

// チェックマークの折れ線(0〜1 の座標)と太さ
const POINTS = [
	[0.27, 0.53],
	[0.43, 0.69],
	[0.74, 0.33],
];
const THICK = 0.1;

function distToSegment(px, py, [ax, ay], [bx, by]) {
	const dx = bx - ax;
	const dy = by - ay;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** maskable は全面塗り+中央 80% にマークを収める。any は角丸の正方形(角は透明) */
function render(size, { maskable }) {
	const scale = maskable ? 0.8 : 1;
	const pts = POINTS.map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]);
	const radius = maskable ? 0 : 0.22;
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0; // filter: none
		for (let x = 0; x < size; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let sy = 0; sy < SS; sy++) {
				for (let sx = 0; sx < SS; sx++) {
					const px = (x + (sx + 0.5) / SS) / size;
					const py = (y + (sy + 0.5) / SS) / size;
					// 角丸の外
					const cx = Math.min(px, 1 - px);
					const cy = Math.min(py, 1 - py);
					if (radius > 0 && cx < radius && cy < radius && Math.hypot(radius - cx, radius - cy) > radius)
						continue;
					const onMark =
						distToSegment(px, py, pts[0], pts[1]) <= (THICK * scale) / 2 ||
						distToSegment(px, py, pts[1], pts[2]) <= (THICK * scale) / 2;
					const c = onMark ? FG : BG;
					r += c[0];
					g += c[1];
					b += c[2];
					a += 255;
				}
			}
			const n = SS * SS;
			const o = y * (size * 4 + 1) + 1 + x * 4;
			// 透明を含む画素は、塗られたサンプルだけで平均した色にする
			const filled = a / 255 || 1;
			raw[o] = Math.round(r / filled);
			raw[o + 1] = Math.round(g / filled);
			raw[o + 2] = Math.round(b / filled);
			raw[o + 3] = Math.round(a / n);
		}
	}
	return png(size, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}
function png(size, raw) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon-192.png"), render(192, { maskable: false }));
writeFileSync(join(out, "icon-512.png"), render(512, { maskable: false }));
writeFileSync(join(out, "icon-maskable-512.png"), render(512, { maskable: true }));
console.log("wrote icons to", out);
