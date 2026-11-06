import { decodeDotProject, encodeDotProject, maxProjectDots } from './dotBitmap.ts';

export type DotPlane = ReturnType<typeof decodeDotProject>;
export const partNames = ['Body', 'Left border', 'Right border', 'Pallu', 'Motif'] as const;
export type Part = typeof partNames[number];
export type Parts = Partial<Record<Part, DotPlane>>;
export const repeatModes = ['Straight', 'Half-drop', 'Mirror'] as const;
export type RepeatMode = typeof repeatModes[number];
export type Layout = {
  width: number;
  bodyPicks: number;
  palluPicks: number;
  leftHooks: number;
  rightHooks: number;
  repeat: RepeatMode;
};

function panelDimensions(layout: Layout) {
  const { width, bodyPicks, palluPicks, leftHooks, rightHooks } = layout;
  const height = bodyPicks + palluPicks;
  const innerWidth = width - leftHooks - rightHooks;
  if (![width, bodyPicks, palluPicks, leftHooks, rightHooks].every(n => Number.isInteger(n) && n >= 0) ||
      bodyPicks < 1 || innerWidth < 1 || width > 16384 || height > 16384 || width * height > maxProjectDots) {
    throw new Error('Enter valid dimensions. Borders must leave room for the body, and the panel can contain up to 8 million dots.');
  }
  return { height, innerWidth };
}

export function assembleSaree(parts: Parts, layout: Layout): DotPlane {
  const { width, bodyPicks, palluPicks, leftHooks, rightHooks, repeat } = layout;
  const { height, innerWidth } = panelDimensions(layout);
  if (!parts.Body || (palluPicks && !parts.Pallu) ||
      (leftHooks && !parts['Left border']) || (rightHooks && !parts['Right border'])) {
    throw new Error('Add a body and a design for each border or pallu with a nonzero size.');
  }

  const dots = new Uint8Array(width * height);
  const tile = (part: Part, x0: number, y0: number, w: number, h: number,
                mode: RepeatMode = 'Straight', overlay = false) => {
    const source = parts[part];
    if (!source) return;
    for (let x = 0; x < w; x++) {
      const odd = Math.floor(x / source.width) % 2 === 1;
      const shift = odd && mode === 'Half-drop' ? Math.floor(source.height / 2) : 0;
      const column = x % source.width;
      const sx = odd && mode === 'Mirror' ? source.width - 1 - column : column;
      for (let y = 0; y < h; y++) {
        const sy = (y + shift) % source.height;
        const dot = source.dots[sy * source.width + sx];
        if (dot || !overlay) dots[(y0 + y) * width + x0 + x] = dot;
      }
    }
  };
  tile('Body', leftHooks, 0, innerWidth, bodyPicks, repeat);
  tile('Motif', leftHooks, 0, innerWidth, bodyPicks, repeat, true);
  tile('Pallu', leftHooks, bodyPicks, innerWidth, palluPicks);
  tile('Left border', 0, 0, leftHooks, height);
  tile('Right border', width - rightHooks, 0, rightHooks, height);
  return { width, height, dots };
}

export function saveAssembly(parts: Parts, layout: Layout): string {
  panelDimensions(layout);
  const encoded: Partial<Record<Part, string>> = {};
  for (const name of partNames) {
    const plane = parts[name];
    if (!plane) continue;
    const bytes = new Uint8Array(encodeDotProject(plane.dots, plane.width, plane.height));
    const chunks: string[] = [];
    for (let start = 0; start < bytes.length; start += 16384) {
      chunks.push(String.fromCharCode(...bytes.subarray(start, start + 16384)));
    }
    encoded[name] = btoa(chunks.join(''));
  }
  return JSON.stringify({ version: 1, parts: encoded, layout });
}

export function openAssembly(text: string): { parts: Parts; layout: Layout } {
  const project = JSON.parse(text);
  if (project?.version !== 1 || !project.parts || !project.layout || !repeatModes.includes(project.layout.repeat)) {
    throw new Error('Choose a valid WeaveCore saree assembly project.');
  }
  const parts: Parts = {};
  for (const name of partNames) {
    const encoded = project.parts[name];
    if (encoded === undefined) continue;
    if (typeof encoded !== 'string' || encoded.length > Math.ceil((maxProjectDots + 12) / 3) * 4) {
      throw new Error('A project component exceeds the supported size.');
    }
    parts[name] = decodeDotProject(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)).buffer);
  }
  panelDimensions(project.layout);
  return { parts, layout: project.layout };
}
