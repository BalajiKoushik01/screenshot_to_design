import React, { useEffect, useRef, useState } from 'react';
import { decodeDotBmp, decodeDotProject, encodeDotBmp, encodeDotProject, fillDots, maxProjectDots } from '../dotBitmap';

type Tool = 'pencil' | 'eraser' | 'fill';
type Point = { x: number; y: number };
const tools: Tool[] = ['pencil', 'eraser', 'fill'];

export default function DotStudio({ source }: { source?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pixels = useRef<Uint8Array>(new Uint8Array());
  const undo = useRef<Uint8Array[]>([]);
  const redo = useRef<Uint8Array[]>([]);
  const stroke = useRef<{ pointer: number; point: Point; value: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('pencil');
  const [ink, setInk] = useState(1);
  const [zoom, setZoom] = useState(2);
  const [grid, setGrid] = useState(true);
  const [mirror, setMirror] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ undo: false, redo: false });

  useEffect(() => {
    if (!source) return;
    const image = new Image();
    image.onload = () => {
      try {
        if (image.naturalWidth * image.naturalHeight > maxProjectDots ||
            image.naturalWidth > 16_384 || image.naturalHeight > 16_384) {
          setError('This design exceeds the Dot Studio project size limit.');
          return;
        }
        const target = canvas.current!;
        target.width = image.naturalWidth;
        target.height = image.naturalHeight;
        const ctx = target.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, target.width, target.height).data;
        pixels.current = Uint8Array.from({ length: rgba.length / 4 }, (_, index) => Number(rgba[index * 4] >= 128));
        setSize({ width: target.width, height: target.height });
      } catch {
        setError('The reconstructed dot image could not be read.');
      }
    };
    image.onerror = () => setError('The reconstructed dot image could not be loaded.');
    image.src = source;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [source]);

  const context = () => canvas.current!.getContext('2d')!;

  const render = (width = size.width, height = size.height) => {
    const ctx = context();
    const frame = ctx.createImageData(width, height);
    pixels.current.forEach((dot, index) => {
      const offset = index * 4;
      frame.data.fill(dot * 255, offset, offset + 3);
      frame.data[offset + 3] = 255;
    });
    ctx.putImageData(frame, 0, 0);
  };

  const updateHistory = () => setHistory({ undo: undo.current.length > 0, redo: redo.current.length > 0 });
  const checkpoint = () => {
    undo.current.push(pixels.current.slice());
    const limit = Math.max(1, Math.min(24, Math.floor(24_000_000 / pixels.current.length)));
    if (undo.current.length > limit) undo.current.shift();
    redo.current = [];
    updateHistory();
  };

  const restore = (direction: 'undo' | 'redo') => {
    if (stroke.current) return;
    const previous = direction === 'undo' ? undo.current : redo.current;
    const next = direction === 'undo' ? redo.current : undo.current;
    const frame = previous.pop();
    if (!frame) return;
    next.push(pixels.current);
    pixels.current = frame;
    render();
    updateHistory();
  };

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.width - 1, Math.floor((event.clientX - bounds.left) / zoom))),
      y: Math.max(0, Math.min(size.height - 1, Math.floor((event.clientY - bounds.top) / zoom))),
    };
  };

  const drawLine = (from: Point, to: Point, value: number) => {
    const ctx = context();
    ctx.fillStyle = value ? '#fff' : '#000';
    let { x, y } = from;
    const dx = Math.abs(to.x - x);
    const dy = -Math.abs(to.y - y);
    const sx = x < to.x ? 1 : -1;
    const sy = y < to.y ? 1 : -1;
    let error = dx + dy;
    while (true) {
      pixels.current[y * size.width + x] = value;
      ctx.fillRect(x, y, 1, 1);
      if (mirror) {
        const reflectedX = size.width - 1 - x;
        pixels.current[y * size.width + reflectedX] = value;
        ctx.fillRect(reflectedX, y, 1, 1);
      }
      if (x === to.x && y === to.y) break;
      const step = 2 * error;
      if (step >= dy) {
        error += dy;
        x += sx;
      }
      if (step <= dx) {
        error += dx;
        y += sy;
      }
    }
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!size.width || opening || event.button !== 0 || stroke.current) return;
    const point = pointAt(event);
    const index = point.y * size.width + point.x;
    if (tool === 'fill') {
      if (pixels.current[index] === ink) return;
      checkpoint();
      fillDots(pixels.current, size.width, index, ink);
      render();
      return;
    }
    checkpoint();
    const value = tool === 'eraser' ? 0 : ink;
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { pointer: event.pointerId, point, value };
    drawLine(point, point, value);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = stroke.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointAt(event);
    drawLine(active.point, point, active.value);
    active.point = point;
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (stroke.current?.pointer === event.pointerId) stroke.current = null;
  };

  const download = (bytes: ArrayBuffer, filename: string, mimeType: string) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openDesign = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || opening || stroke.current) return;
    if (history.undo && !window.confirm('Replace this design? Save a project first to keep your current edits.')) return;
    setOpening(true);
    setError('');
    try {
      // Allow scanline padding and headers on top of the maximum dot count.
      if (file.size > maxProjectDots + 65_536) throw new Error('This file exceeds the Dot Studio size limit.');
      const buffer = await file.arrayBuffer();
      const project = file.name.toLowerCase().endsWith('.bmp') ? decodeDotBmp(buffer) : decodeDotProject(buffer);
      const target = canvas.current;
      if (!target) return;
      target.width = project.width;
      target.height = project.height;
      pixels.current = project.dots;
      undo.current = [];
      redo.current = [];
      setSize({ width: project.width, height: project.height });
      render(project.width, project.height);
      updateHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The project could not be opened.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className="card" style={{ padding: 16, minWidth: 0 }} aria-label="Saree Dot Studio">
      <h2>Saree Dot Studio</h2>
      <p className="text-xs text-muted">Edit a black-and-white dot design. Save an editable project to resume later or export an 8-bit BMP for handoff.</p>
      {error && <p role="alert">{error}</p>}
      {source && !size.width && !error && <p role="status">Loading the reconstructed dots…</p>}
      {(!source || size.width > 0 || error) && (
        <label>Open a project or black-and-white BMP <input type="file" accept=".sjd,.bmp" disabled={opening} onChange={openDesign} /></label>
      )}
      {size.width > 0 && (
        <>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
            {tools.map((option) => (
              <button key={option} type="button" aria-pressed={tool === option}
                className={`btn btn-sm ${tool === option ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTool(option)} style={{ textTransform: 'capitalize' }}>{option}</button>
            ))}
            <label>Ink <select value={ink} onChange={(event) => setInk(Number(event.target.value))}>
              <option value={1}>White Zari</option><option value={0}>Black ground</option>
            </select></label>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!history.undo} onClick={() => restore('undo')}>Undo</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!history.redo} onClick={() => restore('redo')}>Redo</button>
            <label>Zoom <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
              {[1, 2, 4, 8, 16].map((level) => <option key={level} value={level}>{level}×</option>)}
            </select></label>
            <label><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Dot grid</label>
            <label><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} /> Mirror pencil and eraser</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(
              encodeDotProject(pixels.current, size.width, size.height), 'saree_design.sjd', 'application/octet-stream',
            )}>Save project</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => download(
              encodeDotBmp(pixels.current, size.width, size.height), 'saree_edited_dots.bmp', 'image/bmp',
            )}>Export edited 8-bit BMP</button>
          </div>
          <p className="text-xs text-muted">{size.width} hooks × {size.height} picks</p>
        </>
      )}
      <div style={{ maxHeight: '60vh', overflow: 'auto', marginTop: 8 }} hidden={!size.width}>
        <div style={{ position: 'relative', width: size.width * zoom, height: size.height * zoom }}>
          <canvas ref={canvas} aria-label="Editable black-and-white Zari pattern"
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endStroke}
            onPointerCancel={endStroke} onLostPointerCapture={endStroke}
            style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', touchAction: 'none', cursor: 'crosshair' }} />
          {grid && zoom >= 4 && (
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(to right, #8886 1px, transparent 1px), linear-gradient(to bottom, #8886 1px, transparent 1px)',
              backgroundSize: `${zoom}px ${zoom}px`,
            }} />
          )}
        </div>
      </div>
    </section>
  );
}
