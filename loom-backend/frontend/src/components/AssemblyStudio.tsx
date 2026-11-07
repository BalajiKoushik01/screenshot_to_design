import React, { useEffect, useMemo, useRef, useState } from 'react';
import DotStudio from './DotStudio';
import { decodeDotBmp, encodeDotBmp, maxProjectDots } from '../dotBitmap';
import { assembleSaree, openAssembly, partNames, repeatModes, saveAssembly } from '../sareeAssembly';
import type { DotPlane, Layout, Part, Parts } from '../sareeAssembly';

const fields = [
  ['width', 'Total hooks'], ['bodyPicks', 'Body picks'], ['palluPicks', 'Pallu picks'],
  ['leftHooks', 'Left border hooks'], ['rightHooks', 'Right border hooks'],
] as const;
const initialLayout: Layout = {
  width: 240, bodyPicks: 480, palluPicks: 0, leftHooks: 0, rightHooks: 0, repeat: 'Straight',
};

function download(data: BlobPart, filename: string) {
  const url = URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AssemblyStudio({ seed, extracted = {} }: {
  seed?: DotPlane;
  extracted?: Partial<Record<Part, string>>;
}) {
  const [parts, setParts] = useState<Parts>({});
  const [layout, setLayout] = useState(initialLayout);
  const [selected, setSelected] = useState<Part>('Body');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const result = useMemo(() => {
    try {
      return { panel: assembleSaree(parts, layout), message: '' };
    } catch (reason) {
      return { panel: undefined, message: (reason as Error).message };
    }
  }, [parts, layout]);
  const panel = result.panel;

  useEffect(() => {
    if (!panel || !canvas.current) return;
    const target = canvas.current;
    target.width = panel.width;
    target.height = panel.height;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    const frame = ctx.createImageData(panel.width, panel.height);
    panel.dots.forEach((dot, index) => {
      const offset = index * 4;
      frame.data[offset] = frame.data[offset + 1] = frame.data[offset + 2] = dot * 255;
      frame.data[offset + 3] = 255;
    });
    ctx.putImageData(frame, 0, 0);
  }, [panel, editing]);

  const put = (plane: DotPlane) => {
    setParts(previous => ({ ...previous, [selected]: plane }));
    setEditing(false);
  };
  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this design.');
    } finally {
      setLoading(false);
    }
  };

  if (editing && parts[selected]) {
    return <section>
      <h2>Edit {selected.toLowerCase()}</h2>
      <button type="button" className="btn btn-secondary btn-sm"
        onClick={() => {
          if (window.confirm('Return to the panel without applying these edits?')) setEditing(false);
        }}>Back to assembly</button>
      <DotStudio initial={parts[selected]} onApply={put} />
    </section>;
  }

  return <section className="card" style={{ padding: 16, width: '100%', minWidth: 0 }}>
    <h2>Saree Assembly</h2>
    <p className="text-xs text-muted">Choose a part, add its dots, and set the panel dimensions. Parts tile at their native dot size. The motif overlays the body, and the pallu follows it.</p>
    <fieldset disabled={loading} style={{ border: 0, padding: 0, marginTop: 12 }}>
      <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Part <select value={selected} onChange={event => setSelected(event.target.value as Part)}>
          {partNames.map(name => <option key={name}>{name}</option>)}
        </select></label>
        <label>Import part BMP <input type="file" accept=".bmp" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(async () => {
            if (file.size > maxProjectDots + 65536) throw new Error('This BMP exceeds the editor size limit.');
            put(decodeDotBmp(await file.arrayBuffer()));
          });
        }} /></label>
        {extracted[selected] && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void run(async () => {
          const response = await fetch(extracted[selected]!);
          if (!response.ok) throw new Error('The extracted part is unavailable.');
          put(decodeDotBmp(await response.arrayBuffer()));
        })}>Use extracted part</button>}
        {seed && <button type="button" className="btn btn-secondary btn-sm" onClick={() => put(seed)}>Use dots from editor</button>}
        {!parts[selected] && <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
          put({ width: 32, height: 32, dots: new Uint8Array(32 * 32) });
          setEditing(true);
        }}>Draw blank 32 × 32 tile</button>}
        {parts[selected] && <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit part</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParts(previous => ({
            ...previous, [selected]: undefined,
          }))}>Remove part</button>
        </>}
      </div>
      <p className="text-xs text-muted">{partNames.filter(name => parts[name]).join(' · ') || 'No parts loaded'}</p>
      <div className="flex gap-2" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
        {fields.map(([key, label]) => <label key={key}>{label} <input type="number" min={0} max={16384}
          style={{ width: 80 }} value={layout[key]}
          onChange={event => setLayout(previous => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}
        <label>Body repeat <select value={layout.repeat} onChange={event => setLayout(previous => ({
          ...previous, repeat: event.target.value as Layout['repeat'],
        }))}>{repeatModes.map(mode => <option key={mode}>{mode}</option>)}</select></label>
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Open assembly <input type="file" accept=".saree" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || (partNames.some(name => parts[name]) &&
            !window.confirm('Replace the current assembly?'))) return;
          void run(async () => {
            if (file.size > 54_000_000) throw new Error('This project exceeds the editor size limit.');
            const saved = openAssembly(await file.text());
            setParts(saved.parts);
            setLayout(saved.layout);
          });
        }} /></label>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!partNames.some(name => parts[name])}
          onClick={() => void run(async () => download(saveAssembly(parts, layout), 'weavecore_design.saree'))}>Save assembly</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!panel}
          onClick={() => panel && download(encodeDotBmp(panel.dots, panel.width, panel.height), 'saree_panel.bmp')}>Export panel BMP</button>
      </div>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading design…</p>}
    <p className="text-xs text-muted" aria-live="polite">{panel ? `${panel.width} hooks × ${panel.height} picks` : result.message}</p>
    <canvas ref={canvas} hidden={!panel} aria-label="Assembled saree panel preview"
      style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', imageRendering: 'pixelated', border: '1px solid #888' }} />
  </section>;
}
