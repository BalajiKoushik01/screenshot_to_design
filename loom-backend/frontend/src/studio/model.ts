export type RGB = [number, number, number];
export type Region = { name: string; x: number; y: number; width: number; height: number };
export type Design = {
  schema: 'weavecore.indexed.v1'; width: number; height: number;
  palette: RGB[]; pixels: Uint8Array; names: string[]; regions: Region[];
  provenance: Record<string, unknown>;
  report: { used_colors: number; rgb_mae: number | null; exact_sampled_rgb: boolean | null; notes: string[] };
};
export const MAX_PIXELS = 4_000_000;
export function sizeOK(w: number, h: number) {
  return Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 16384 && h <= 16384 && w * h <= MAX_PIXELS;
}
export function fromJSON(raw: unknown): Design {
  if (!raw || typeof raw !== 'object') throw Error('Invalid project');
  const d = raw as any;
  if (d.schema !== 'weavecore.indexed.v1' || !sizeOK(d.width, d.height)) throw Error('Unsupported project or dimensions');
  if (!Array.isArray(d.palette) || d.palette.length < 1 || d.palette.length > 256 || d.palette.some((c: unknown) => !Array.isArray(c) || c.length !== 3 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255))) throw Error('Invalid palette');
  const expected = 4 * Math.ceil(d.width * d.height / 3);
  if (typeof d.indices !== 'string' || d.indices.length !== expected || !/^[A-Za-z0-9+/]*={0,2}$/.test(d.indices)) throw Error('Invalid pixel data');
  const binary = atob(d.indices);
  if (binary.length !== d.width * d.height) throw Error('Pixel count does not match dimensions');
  const pixels = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (pixels.some(i => i >= d.palette.length)) throw Error('Pixel references missing palette entry');
  const regions = d.regions ?? [];
  if (!Array.isArray(regions) || regions.length > 100 || regions.some((r: any) => !validRegion(r, d.width, d.height))) throw Error('Invalid panel selection');
  return { schema: d.schema, width: d.width, height: d.height, palette: d.palette.map((c: RGB) => [...c]), pixels,
    names: d.palette.map((_: RGB, i: number) => typeof d.names?.[i] === 'string' ? d.names[i].slice(0, 80) : `Color ${i}`),
    regions, provenance: d.provenance && typeof d.provenance === 'object' ? d.provenance : {},
    report: { used_colors: new Set(pixels).size, rgb_mae: typeof d.report?.rgb_mae === 'number' ? d.report.rgb_mae : null,
      exact_sampled_rgb: typeof d.report?.exact_sampled_rgb === 'boolean' ? d.report.exact_sampled_rgb : null,
      notes: Array.isArray(d.report?.notes) ? d.report.notes.filter((n: unknown) => typeof n === 'string').slice(0, 20) : [] } };
}
export function serialize(d: Design) {
  let binary = '';
  for (let i = 0; i < d.pixels.length; i += 8192) binary += String.fromCharCode(...d.pixels.subarray(i, i + 8192));
  const { pixels, ...rest } = d;
  return { ...rest, indices: btoa(binary) };
}
export function clone(d: Design): Design {
  return { ...d, pixels: d.pixels.slice(), palette: d.palette.map(c => [...c]), names: [...d.names], regions: d.regions.map(r => ({ ...r })) };
}
export function validRegion(r: any, w: number, h: number): r is Region {
  return r && typeof r.name === 'string' && r.name.length <= 80 && [r.x, r.y, r.width, r.height].every(Number.isInteger)
    && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= w && r.y + r.height <= h;
}
export function crop(d: Design, r: Region): Design {
  if (!validRegion(r, d.width, d.height)) throw Error('Selection is outside the design');
  const out = clone(d); out.width = r.width; out.height = r.height; out.regions = [];
  out.pixels = new Uint8Array(r.width * r.height);
  for (let y = 0; y < r.height; y++) out.pixels.set(d.pixels.subarray((y + r.y) * d.width + r.x, (y + r.y) * d.width + r.x + r.width), y * r.width);
  return out;
}
export function tile(d: Design, across: number, down: number, mode: RepeatMode = "straight"): Design {
  if (!Number.isInteger(across) || !Number.isInteger(down) || !sizeOK(d.width * across, d.height * down)) throw Error('Repeat exceeds the four-million-pixel limit');
  const out = clone(d); out.width *= across; out.height *= down; out.regions = [];
  out.pixels = new Uint8Array(out.width * out.height);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      out.pixels[y * out.width + x] = d.pixels[repeatSource(x, y, d.width, d.height, mode)];
    }
  }
  return out;
}
export function flip(d: Design, horizontal: boolean): Design {
  const out = clone(d);
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) out.pixels[y * d.width + x] = d.pixels[(horizontal ? y : d.height - 1 - y) * d.width + (horizontal ? d.width - 1 - x : x)];
  out.regions = d.regions.map(r => ({ ...r, x: horizontal ? d.width - r.x - r.width : r.x, y: horizontal ? r.y : d.height - r.y - r.height }));
  return out;
}
export function fill(d: Design, x: number, y: number, value: number) {
  const old = d.pixels[y * d.width + x]; if (old === value) return;
  const queue = new Int32Array(d.pixels.length); let start = 0, end = 1;
  queue[0] = y * d.width + x; d.pixels[queue[0]] = value;
  while (start < end) {
    const p = queue[start++], px = p % d.width;
    for (const n of [px > 0 ? p - 1 : -1, px < d.width - 1 ? p + 1 : -1, p - d.width, p + d.width]) {
      if (n >= 0 && n < d.pixels.length && d.pixels[n] === old) { d.pixels[n] = value; queue[end++] = n; }
    }
  }
}
export function stroke(d: Design, a: [number, number], b: [number, number], value: number, brush: number) {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  const low = Math.floor((brush - 1) / 2), high = Math.ceil((brush - 1) / 2);
  for (let t = 0; t <= steps; t++) {
    const cx = Math.round(a[0] + (b[0] - a[0]) * t / steps), cy = Math.round(a[1] + (b[1] - a[1]) * t / steps);
    for (let y = Math.max(0, cy - low); y <= Math.min(d.height - 1, cy + high); y++)
      for (let x = Math.max(0, cx - low); x <= Math.min(d.width - 1, cx + high); x++) d.pixels[y * d.width + x] = value;
  }
}
export function bmp(d: Design): Uint8Array {
  // Windows BITMAPINFOHEADER, 256 RGBQUAD entries, bottom-up rows, DWORD padding.
  const stride = (d.width + 3) & ~3, offset = 1078;
  const bytes = new Uint8Array(offset + stride * d.height), view = new DataView(bytes.buffer);
  bytes[0] = 66; bytes[1] = 77;
  view.setUint32(2, bytes.length, true); view.setUint32(10, offset, true); view.setUint32(14, 40, true);
  view.setInt32(18, d.width, true); view.setInt32(22, d.height, true); view.setUint16(26, 1, true);
  view.setUint16(28, 8, true); view.setUint32(34, stride * d.height, true); view.setUint32(46, 256, true);
  d.palette.forEach(([r, g, b], i) => bytes.set([b, g, r, 0], 54 + i * 4));
  for (let y = 0; y < d.height; y++) bytes.set(d.pixels.subarray(y * d.width, (y + 1) * d.width), offset + (d.height - 1 - y) * stride);
  return bytes;
}
export function seams(d: Design) {
  let x = 0, y = 0;
  for (let row = 0; row < d.height; row++) x += Number(d.pixels[row * d.width] !== d.pixels[row * d.width + d.width - 1]);
  for (let col = 0; col < d.width; col++) y += Number(d.pixels[col] !== d.pixels[(d.height - 1) * d.width + col]);
  return { x: x / d.height, y: y / d.width };
}

export type RepeatMode = 'straight' | 'mirror' | 'half-drop' | 'brick';

export function repeatSource(x: number, y: number, width: number, height: number, mode: RepeatMode) {
  const column = Math.floor(x / width);
  const row = Math.floor(y / height);
  let sourceX = x % width;
  let sourceY = y % height;
  if (mode === 'mirror') {
    if (column % 2) sourceX = width - 1 - sourceX;
    if (row % 2) sourceY = height - 1 - sourceY;
  }
  if (mode === 'half-drop' && column % 2) sourceY = (sourceY + Math.floor(height / 2)) % height;
  if (mode === 'brick' && row % 2) sourceX = (sourceX + Math.floor(width / 2)) % width;
  return sourceY * width + sourceX;
}

export function pasteMotif(design: Design, motif: Design, x: number, y: number, skip: number | null, mapping?: ReadonlyMap<number, number>) {
  const region = { name: 'Motif', x, y, width: motif.width, height: motif.height };
  if (!validRegion(region, design.width, design.height)) throw Error('The motif must fit inside the canvas.');
  const destination = new Int16Array(256).fill(-1);
  for (const index of new Set(motif.pixels)) {
    if (index === skip) continue;
    const target = mapping ? mapping.get(index) : index;
    if (target === undefined || !Number.isInteger(target) || !design.palette[target]) {
      throw Error(`Choose a destination for motif palette index ${index}.`);
    }
    destination[index] = target;
  }
  const next = clone(design);
  for (let row = 0; row < motif.height; row++) {
    for (let column = 0; column < motif.width; column++) {
      const index = motif.pixels[row * motif.width + column];
      if (index !== skip) next.pixels[(y + row) * design.width + x + column] = destination[index];
    }
  }
  return next;
}

export function replaceIndex(design: Design, source: number, target: number, selection?: Region) {
  if (!Number.isInteger(source) || !Number.isInteger(target) || !design.palette[source] || !design.palette[target]) {
    throw Error('Select valid source and destination palette slots.');
  }
  const area = selection ?? { name: 'Canvas', x: 0, y: 0, width: design.width, height: design.height };
  if (!validRegion(area, design.width, design.height)) throw Error('The selection is outside the canvas.');
  const next = clone(design);
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) {
      const offset = y * design.width + x;
      if (next.pixels[offset] === source) next.pixels[offset] = target;
    }
  }
  return next;
}
