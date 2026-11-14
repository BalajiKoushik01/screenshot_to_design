import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bmp, clone, crop, Design, fill, flip, fromJSON, Region, RGB, seams, serialize, sizeOK, stroke, tile, validRegion } from './model';
import './studio.css';

type Tool = 'pencil' | 'fill' | 'pick' | 'select';
const hex = (c: RGB) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumberField({ label, value, onChange, min = 1, max = 16384 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return <label>{label}<input type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
export default function Studio() {
  const [design, setDesign] = useState<Design | null>(null), [file, setFile] = useState<File | null>(null);
  const [sourceURL, setSourceURL] = useState(''), [sourceSize, setSourceSize] = useState([0, 0]);
  const [width, setWidth] = useState(1200), [height, setHeight] = useState(800), [colors, setColors] = useState(16);
  const [mode, setMode] = useState('preserve'), [corners, setCorners] = useState<number[][]>([]), [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tool, setTool] = useState<Tool>('pencil'), [paletteIndex, setActive] = useState(0), [brush, setBrush] = useState(1);
  const [zoom, setZoom] = useState(1), [grid, setGrid] = useState(true), [repeat, setRepeat] = useState(false);
  const [selection, setSelection] = useState<Region | null>(null), [regionName, setRegionName] = useState('Body');
  const [across, setAcross] = useState(2), [down, setDown] = useState(2), [hooks, setHooks] = useState(0);
  const [history, setHistory] = useState<Design[]>([]), [future, setFuture] = useState<Design[]>([]);
  const [dirty, setDirty] = useState(false), [cursor, setCursor] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ before: Design; working: Design; last: [number, number]; start: [number, number]; tool: Tool } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), sourceRef = useRef<HTMLImageElement>(null);
  const active = Math.min(paletteIndex, (design?.palette.length ?? 1) - 1);
  const undoLimit = (d: Design) => Math.max(2, Math.min(40, Math.floor(32_000_000 / d.pixels.length)));
  const install = (d: Design) => { drag.current = null; setDesign(d); setActive(0); setSelection(null); setHistory([]); setFuture([]); setHooks(d.width); setDirty(true); setRepeat(false); setZoom(Math.min(2, 700 / d.width)); };
  const commit = (next: Design, before = design) => {
    if (!before) return;
    setHistory(h => [...h, before].slice(-undoLimit(next))); setFuture([]); setDesign(next); setDirty(true);
  };
  const undo = () => { if (!design || !history.length) return; setFuture(f => [design, ...f]); setDesign(history[history.length - 1]); setHistory(h => h.slice(0, -1)); setSelection(null); setDirty(true); };
  const redo = () => { if (!design || !future.length) return; setHistory(h => [...h, design]); setDesign(future[0]); setFuture(f => f.slice(1)); setSelection(null); setDirty(true); };
  useEffect(() => { const fn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', fn); return () => window.removeEventListener('beforeunload', fn); }, [dirty]);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches('input,select,textarea')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); });
  useEffect(() => () => { if (sourceURL) URL.revokeObjectURL(sourceURL); }, [sourceURL]);
  function render(d: Design, el: HTMLCanvasElement) {
    el.width = d.width; el.height = d.height;
    const ctx = el.getContext('2d')!, data = ctx.createImageData(d.width, d.height);
    d.pixels.forEach((index, i) => { const c = d.palette[index]; data.data[i * 4] = c[0]; data.data[i * 4 + 1] = c[1]; data.data[i * 4 + 2] = c[2]; data.data[i * 4 + 3] = 255; });
    ctx.putImageData(data, 0, 0);
  }
  useEffect(() => {
    if (!design || !canvas.current) return;
    render(design, canvas.current);
    if (repeat && preview.current) {
      const p = preview.current; const tw = Math.min(design.width, 350), th = Math.max(1, Math.round(design.height * tw / design.width));
      p.width = tw * 3; p.height = Math.min(th * 3, 2100); const ctx = p.getContext('2d')!; ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(canvas.current, x * tw, y * th, tw, th);
    }
  }, [design, repeat]);
  async function choose(f: File) {
    setError(''); setNotice('');
    if (f.size > 20 * 1024 * 1024) { setError('Use a file of at most 20 MB.'); return; }
    if (f.name.endsWith('.json')) {
      try { const d = fromJSON(JSON.parse(await f.text())); install(d); setDirty(false); setNotice('Project opened. Palette slots and pixel data restored.'); }
      catch (e) { setError((e as Error).message); } return;
    }
    setFile(f); setSourceURL(URL.createObjectURL(f)); setCorners([]); setPin(false); setSourceSize([0, 0]);
    setNotice('Set the output columns and rows, then extract. TIFF/BMP may not preview in every browser.');
  }
  async function extract() {
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!sizeOK(width, height)) throw Error('Choose valid dimensions, up to four million pixels.');
      if (corners.length !== 0 && corners.length !== 4) throw Error('Finish all four corners or clear the crop.');
      const body = new FormData(); body.append('image', file); body.append('options', JSON.stringify({ width, height, colors, mode, corners: corners.length ? corners : null }));
      const response = await fetch('/api/studio/extract', { method: 'POST', body });
      if (!response.ok) { const result = await response.json(); throw Error(typeof result.detail === 'string' ? result.detail : 'Unable to extract this image.'); }
      install(fromJSON(await response.json())); setNotice('Extraction ready. Compare with the source, then correct individual pixels.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(design!.width - 1, Math.floor((e.clientX - rect.left) * design!.width / rect.width))), Math.max(0, Math.min(design!.height - 1, Math.floor((e.clientY - rect.top) * design!.height / rect.height)))];
  }
  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!design || e.button !== 0) return;
    const p = point(e); e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pick') { setActive(design.pixels[p[1] * design.width + p[0]]); return; }
    const working = clone(design);
    if (tool === 'fill') { fill(working, ...p, active); commit(working); return; }
    drag.current = { before: design, working, last: p, start: p, tool };
    if (tool === 'select') setSelection({ name: regionName, x: p[0], y: p[1], width: 1, height: 1 });
    else { stroke(working, p, p, active, brush); render(working, canvas.current!); }
  }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!design) return;
    const p = point(e); setCursor(`Column ${p[0]} · Row ${p[1]} · Index ${design.pixels[p[1] * design.width + p[0]]}`);
    const d = drag.current; if (!d) return;
    if (d.tool === 'select') setSelection({ name: regionName, x: Math.min(d.start[0], p[0]), y: Math.min(d.start[1], p[1]), width: Math.abs(d.start[0] - p[0]) + 1, height: Math.abs(d.start[1] - p[1]) + 1 });
    else { stroke(d.working, d.last, p, active, brush); render(d.working, canvas.current!); }
    d.last = p;
  }
  function finish() { const d = drag.current; if (!d) return; drag.current = null; if (d.tool === 'pencil') commit(d.working, d.before); }
  function operation(fn: () => Design) { try { setError(''); commit(fn()); setSelection(null); } catch (e) { setError((e as Error).message); } }
  function exportBMP(d = design) {
    if (!d) return;
    if (hooks && hooks !== d.width) { setError(`Export width is ${d.width}; the required width is ${hooks}. Change the requirement or edit the design; export will not silently resize it.`); return; }
    save(bmp(d) as BlobPart, 'weavecore-design.bmp', 'image/bmp'); setNotice('8-bit indexed BMP exported with unchanged palette indices. Verify weave mapping in your factory CAD.'); setError('');
  }
  const seam = useMemo(() => design ? seams(design) : null, [design]);
  const counts = useMemo(() => { const values = new Uint32Array(design?.palette.length || 1); design?.pixels.forEach(i => values[i]++); return values; }, [design]);
  return <div className="studio">
    <header className="studio-header"><a href="/" className="studio-brand"><span className="weave-mark">▦</span><span>WeaveCore<small>INDEXED DESIGN STUDIO</small></span></a><span className="studio-tag">From reference to editable pixels</span><button onClick={() => fileInput.current?.click()}>Open image / project</button><input ref={fileInput} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.json" onChange={e => { if (e.target.files?.[0]) void choose(e.target.files[0]); e.target.value = ''; }} /></header>
    <div className="studio-banner"><strong>01 Extract</strong><span>→</span><strong>02 Refine</strong><span>→</span><strong>03 Export</strong><p>One cell, one palette index. Your design stays editable.</p><a href="?legacy=1">Research workspace ↗</a></div>
    {(error || notice) && <div className={error ? 'studio-message error' : 'studio-message'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <main className="studio-layout">
      <aside className="studio-left">
        <section><h2>Reference & extraction</h2><p className="muted">Start with a flat CAD screenshot or the clearest visible repeat. Remove app controls with the four-point crop.</p>
          <button className="upload-area" onClick={() => fileInput.current?.click()}>{file ? file.name : '＋ Choose a saree design'}<small>PNG · JPG · BMP · TIFF · WebP · Project</small></button>
          {sourceURL && <><div className={'source-frame ' + (pin ? 'pinning' : '')}><img ref={sourceRef} src={sourceURL} alt="Original design reference" onLoad={e => { const im = e.currentTarget; setSourceSize([im.naturalWidth, im.naturalHeight]); if (im.naturalWidth * im.naturalHeight <= 4_000_000) { setWidth(im.naturalWidth); setHeight(im.naturalHeight); } }} onClick={e => {
            if (!pin || corners.length >= 4) return; const r = e.currentTarget.getBoundingClientRect();
            setCorners(c => [...c, [Math.min(sourceSize[0] - 1, Math.max(0, Math.round((e.clientX - r.left) * sourceSize[0] / r.width))), Math.min(sourceSize[1] - 1, Math.max(0, Math.round((e.clientY - r.top) * sourceSize[1] / r.height)))]]);
          }} />{sourceSize[0] > 0 && corners.map((p, i) => <span key={i} className="pin" style={{ left: `${p[0] / sourceSize[0] * 100}%`, top: `${p[1] / sourceSize[1] * 100}%` }}>{i + 1}</span>)}</div><div className="button-row"><button onClick={() => { setCorners([]); setPin(true); }}>Pin crop corners</button><button onClick={() => { setCorners([]); setPin(false); }}>Full image</button></div>{pin && <p className="muted">Click top-left → top-right → bottom-right → bottom-left. {corners.length}/4 selected.</p>}</>}
          <div className="field-row"><NumberField label="Output columns" value={width} onChange={setWidth} /><NumberField label="Output rows" value={height} onChange={setHeight} /></div>
          <label>Color handling<select value={mode} onChange={e => setMode(e.target.value)}><option value="preserve">Preserve exact sampled colors</option><option value="reduce">Reduce colors for a photograph</option></select></label>
          {mode === 'reduce' && <NumberField label="Palette size" min={2} max={256} value={colors} onChange={setColors} />}
          <button className="primary" disabled={!file || busy} onClick={extract}>{busy ? 'Extracting…' : design ? 'Extract a new design' : 'Extract editable design'}</button>
          <p className="muted">Photos can lose or hide details. Color reduction is an approximation; missing motifs are never silently replaced.</p>
        </section>
        {design && <section><h2>Palette <span>{counts.filter(v => v > 0).length} used</span></h2><div className="palette">{design.palette.map((c, i) => <button key={i} className={i === active ? 'chosen' : ''} style={{ background: hex(c), opacity: counts[i] ? 1 : .45 }} title={`${i} · ${design.names[i]} · ${counts[i]} pixels`} aria-label={`Palette index ${i}`} onClick={() => setActive(i)}>{i === active ? '✓' : ''}</button>)}</div><label>Index {active} · {counts[active]} pixels<input value={design.names[active]} maxLength={80} onChange={e => { const n = clone(design); n.names[active] = e.target.value; commit(n); }} /></label><label>Display color (keeps index)<input type="color" value={hex(design.palette[active])} onChange={e => { const v = e.target.value; const n = clone(design); n.palette[active] = [1, 3, 5].map(k => parseInt(v.slice(k, k + 2), 16)) as RGB; commit(n); }} /></label><button disabled={design.palette.length >= 256} onClick={() => { const n = clone(design); n.palette.push([255, 255, 255]); n.names.push('New color'); commit(n); setActive(n.palette.length - 1); }}>＋ Add palette slot</button></section>}
      </aside>
      <section className="studio-center">
        {design ? <><div className="editor-toolbar"><div className="button-row">{(['pencil', 'fill', 'pick', 'select'] as Tool[]).map(t => <button className={tool === t ? 'active' : ''} key={t} onClick={() => setTool(t)}>{({ pencil: 'Pencil', fill: 'Flood fill', pick: 'Pick color', select: 'Select panel' })[t]}</button>)}</div><div className="button-row"><button disabled={!history.length} onClick={undo}>Undo</button><button disabled={!future.length} onClick={redo}>Redo</button></div></div>
          <div className="editor-options"><label>Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{Array.from(new Set([zoom, .25, .5, 1, 2, 4, 8, 16])).sort((a, b) => a - b).map(v => <option value={v} key={v}>{Math.round(v * 100)}%</option>)}</select></label><label>Brush<select value={brush} onChange={e => setBrush(Number(e.target.value))}>{[1, 2, 3, 5, 9].map(v => <option key={v}>{v}</option>)}</select></label><label className="check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />Pixel grid</label><button onClick={() => setZoom(Math.min(2, 700 / design.width))}>Fit width</button></div>
          <div className="canvas-scroll"><div className="pixel-surface" style={{ width: design.width * zoom, height: design.height * zoom }}><canvas ref={canvas} aria-label="Editable indexed design" style={{ width: '100%', height: '100%' }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />{grid && zoom >= 8 && <div className="pixel-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} />}{selection && <div className="pixel-selection" style={{ left: selection.x * zoom, top: selection.y * zoom, width: selection.width * zoom, height: selection.height * zoom }} />}</div></div>
          <div className="canvas-status"><span>{design.width} × {design.height} cells · 8-bit indexed</span><span>{cursor || 'Zoom in to inspect individual cells'}</span></div>
          <div className="repeat-heading"><h2>Repeat inspection</h2><button onClick={() => setRepeat(v => !v)}>{repeat ? 'Hide' : 'Show 3 × 3 preview'}</button></div>{repeat && <div className="repeat-preview"><canvas ref={preview} /></div>}
          <p className="muted">Edge index differences: horizontal {(seam!.x * 100).toFixed(1)}% · vertical {(seam!.y * 100).toFixed(1)}%. This is a seam diagnostic, not a guarantee of a seamless motif.</p>
        </> : <div className="studio-empty"><div className="woven-art" /><span className="eyebrow">DESIGNED FOR THE DOT WORK</span><h1>Keep every<br />detail intentional.</h1><p>Extract your saree artwork into a real indexed canvas. Refine zari, meena, borders and repeats at the pixel level, then export an editable bitmap.</p><button className="primary" onClick={() => fileInput.current?.click()}>Open your first design</button><div className="empty-features"><span>Exact palette preservation</span><span>Pixel editing & undo</span><span>8-bit BMP export</span></div></div>}
      </section>
      <aside className="studio-right">
        {design ? <><section><h2>Panels & repeats</h2><p className="muted">Drag with Select panel to isolate a body, border, pallu or motif. Rectangles stay editable in the project.</p><label>Panel name<input value={regionName} maxLength={80} onChange={e => setRegionName(e.target.value)} /></label>
          {selection && <><div className="field-row"><NumberField label="X" min={0} value={selection.x} onChange={v => setSelection({ ...selection, x: v })} /><NumberField label="Y" min={0} value={selection.y} onChange={v => setSelection({ ...selection, y: v })} /></div><div className="field-row"><NumberField label="Width" value={selection.width} onChange={v => setSelection({ ...selection, width: v })} /><NumberField label="Height" value={selection.height} onChange={v => setSelection({ ...selection, height: v })} /></div><div className="button-row"><button onClick={() => { if (!validRegion(selection, design.width, design.height) || design.regions.length >= 100) { setError('Invalid selection or panel limit reached.'); return; } const n = clone(design); n.regions.push({ ...selection, name: regionName }); commit(n); }}>Save panel</button><button onClick={() => operation(() => crop(design, selection))}>Crop to panel</button></div></>}
          {design.regions.map((r, i) => <div className="region-row" key={i}><button onClick={() => { setSelection(r); setRegionName(r.name); }}>{r.name} <small>{r.width} × {r.height}</small></button><button aria-label={`Delete ${r.name}`} onClick={() => { const n = clone(design); n.regions.splice(i, 1); commit(n); }}>×</button></div>)}
          <div className="button-row"><button onClick={() => operation(() => flip(design, true))}>Mirror ↔</button><button onClick={() => operation(() => flip(design, false))}>Mirror ↕</button></div><div className="field-row"><NumberField label="Across" max={64} value={across} onChange={setAcross} /><NumberField label="Down" max={64} value={down} onChange={setDown} /></div><button onClick={() => operation(() => tile(design, across, down))}>Build repeats</button><p className="muted">Crop to a clean repeat first. Mirroring and tiling happen only when you request them.</p></section>
          <section><h2>Extraction evidence</h2><dl><dt>Sampled RGB preserved</dt><dd>{design.report.exact_sampled_rgb === null ? 'Not measured' : design.report.exact_sampled_rgb ? 'Yes, at extraction' : 'No — colors reduced'}</dd><dt>Mean RGB error at extraction</dt><dd>{design.report.rgb_mae === null ? 'Not measured' : design.report.rgb_mae.toFixed(2) + ' / 255'}</dd></dl><p className="muted">Compared with sampled input, before manual edits. This does not measure recovery of the original loom design.</p>{design.report.notes.map((note, i) => <p className="report-note" key={i}>{note}</p>)}</section>
          <section><h2>Save & export</h2><NumberField label="Required export width (0 = any)" min={0} value={hooks} onChange={setHooks} /><p className="muted">No resizing or palette remapping during export. Assign weave structures and verify controller compatibility in your factory workflow.</p><button className="primary" onClick={() => exportBMP()}>Export indexed BMP</button><button onClick={() => { save(JSON.stringify(serialize(design)), 'weavecore-project.json', 'application/json'); setDirty(false); setNotice('Editable project saved. Keep this file to resume your work.'); }}>Save editable project{dirty ? ' •' : ''}</button><button onClick={() => { const d = document.createElement('canvas'); render(design, d); d.toBlob(b => { if (b) save(b, 'weavecore-preview.png', 'image/png'); }); }}>Export PNG preview</button><button disabled={!selection} onClick={() => { if (selection) { try { const d = crop(design, selection); save(bmp(d) as BlobPart, 'weavecore-panel.bmp', 'image/bmp'); } catch (e) { setError((e as Error).message); } } }}>Export selected panel BMP</button></section>
        </> : <section><h2>A faithful starting point</h2><ol><li>Choose a source and set the intended grid dimensions.</li><li>Preserve exact colors for CAD screenshots, or explicitly reduce a photo’s colors.</li><li>Correct cells, name palette slots and inspect repeats.</li><li>Save the editable project and export an indexed BMP.</li></ol><p className="muted">Extraction runs on this app’s server. Editing and project/BMP exports run in your browser. This studio does not retain uploaded images.</p></section>}
      </aside>
    </main>
    <footer>WeaveCore · Artwork preparation for silk saree designers <span>Save your project before closing this tab.</span></footer>
  </div>;
}
