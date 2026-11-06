import React, { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, ImageIcon, Crosshair, PenTool, Cpu, CheckCircle2,
  RefreshCw, Info, AlertCircle, Sliders, Layers,
  ChevronRight, Eye, Grid3X3,
} from 'lucide-react';

import LoomCanvas, { LoomCanvasRef } from './components/LoomCanvas';
import DotStudio from './components/DotStudio';
import CompleteWorkspace from './components/CompleteWorkspace';
import StageMonitor   from './components/StageMonitor';
import ResultsPanel   from './components/ResultsPanel';
import { useLoomStore, LoomStep } from './store/useLoomStore';
import { useProcessDesign }       from './hooks/useProcessDesign';

// ── Step configuration ─────────────────────────────────────────────────────
const STEPS: { id: LoomStep; label: string; icon: React.ReactNode }[] = [
  { id: LoomStep.UPLOADED,    label: 'Upload',    icon: <Upload size={12} />       },
  { id: LoomStep.CALIBRATING, label: 'Calibrate', icon: <Crosshair size={12} />   },
  { id: LoomStep.MASKING,     label: 'Mask',      icon: <PenTool size={12} />     },
  { id: LoomStep.PROCESSING,  label: 'Process',   icon: <Cpu size={12} />         },
  { id: LoomStep.COMPLETE,    label: 'Export',    icon: <CheckCircle2 size={12} /> },
];

function stepIdx(s: LoomStep) {
  return STEPS.findIndex(x => x.id === s);
}

// ── App ────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const {
    step, imagePath, brushSize, coordinates, downloadUrl, taskId,
    setStep, setImagePath, setBrushSize, reset,
  } = useLoomStore(s => s);

  const { startProcessing, loadTaskById, error: processError } = useProcessDesign();

  const [colorCount,   setColorCount]   = useState(8);
  const [targetWidth,  setTargetWidth]  = useState(1200);
  const [customWidth,  setCustomWidth]  = useState('');
  const [openStudio, setOpenStudio] = useState(false);

  const imageFileRef = useRef<File | null>(null);
  const maskFileRef  = useRef<File | null>(null);
  const canvasRef    = useRef<LoomCanvasRef | null>(null);

  // ── Auto-load task from URL param ─────────────────────────────────────
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTaskId = params.get('task_id');
    if (urlTaskId && step === LoomStep.UPLOADED) {
      loadTaskById(urlTaskId);
    }
  }, [step, loadTaskById]);

  // ── Dropzone ──────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'] },
    multiple: false,
    disabled: step !== LoomStep.UPLOADED,
    onDrop: (files) => {
      const file = files[0];
      if (!file) return;
      imageFileRef.current = file;
      setImagePath(URL.createObjectURL(file));
      setStep(LoomStep.CALIBRATING);
    },
  });

  // ── Run pipeline ─────────────────────────────────────────────────────
  const handleRunPipeline = useCallback(async () => {
    if (!imageFileRef.current) return;
    const w = customWidth ? parseInt(customWidth, 10) || targetWidth : targetWidth;

    let maskFile: File | null = maskFileRef.current;
    if (!maskFile && canvasRef.current) {
      try {
        const maskBlob = await canvasRef.current.getMaskBlob();
        if (maskBlob) {
          maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });
        }
      } catch (err) {
        console.warn('Mask export error:', err);
      }
    }

    await startProcessing({
      imageFile:  imageFileRef.current,
      maskFile:   maskFile,
      colors:     colorCount,
      targetWidth: w,
      coordinates: coordinates as [number, number][],
    });
  }, [colorCount, coordinates, customWidth, startProcessing, targetWidth]);

  const handleReset = () => {
    imageFileRef.current = null;
    maskFileRef.current  = null;
    reset();
  };

  const ci = stepIdx(step);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header animate-in">
        <a className="app-logo" href="/" aria-label="WeaveCore Home">
          <div className="app-logo-mark">W</div>
          <div>
            <div className="app-logo-text gradient-text">WeaveCore</div>
            <div className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              Pattern Extraction Engine v3
            </div>
          </div>
        </a>
        <div className="flex items-center gap-4">
          {step !== LoomStep.UPLOADED && (
            <button className="btn btn-ghost btn-sm" onClick={handleReset}>
              <RefreshCw size={14} /> Start Over
            </button>
          )}
          <div className="pill pill-gold"><Layers size={11} /> MVP · Open Source</div>
        </div>
      </header>

      {/* ── Step progress bar ──────────────────────────────────────────── */}
      <div className="animate-in delay-1" style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}>
        <StepBar currentIndex={ci} />
      </div>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="app-layout" style={{ flex: 1 }}>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="sidebar animate-in delay-2">

          {step === LoomStep.UPLOADED && (
            <>
              <div className="section-title">Source Image</div>
              <p className="text-xs text-muted" style={{ marginBottom: '16px', lineHeight: 1.6 }}>
                Upload a photo or screenshot of a saree.
                Supports PNG, JPG, WEBP, BMP and TIFF.
              </p>
            </>
          )}

          {step === LoomStep.CALIBRATING && (
            <>
              <div className="section-title"><Crosshair size={12} /> Perspective Calibration</div>
              <div className="toast toast-info" style={{ marginBottom: '16px' }}>
                <Info size={14} style={{ flexShrink: 0 }} />
                <span>Drag the corner pins to align with the saree repeat / design boundary.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Quick Crop Presets:
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full text-left"
                  onClick={() => canvasRef.current?.applyPreset('motif')}
                  title="Focus on saree motif / butta"
                  id="preset-motif-btn"
                >
                  🥻 Saree Motif / Butta Crop
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full text-left"
                  onClick={() => canvasRef.current?.applyPreset('border')}
                  title="Focus on lower zari border strip"
                  id="preset-border-btn"
                >
                  🌿 Zari Border Strip
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-full text-left"
                  onClick={() => canvasRef.current?.applyPreset('center')}
                  title="Focus on central body fabric"
                  id="preset-body-btn"
                >
                  📦 Saree Body Fabric
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-full text-left"
                  onClick={() => canvasRef.current?.applyPreset('full')}
                  title="Reset pins to full image"
                  id="preset-full-btn"
                >
                  <RefreshCw size={13} /> Full Image Corners
                </button>
              </div>
              <button
                className="btn btn-primary w-full"
                onClick={() => setStep(LoomStep.MASKING)}
                disabled={coordinates.length !== 4}
                id="confirm-corners-btn"
              >
                <ChevronRight size={14} /> Confirm Corners
              </button>
              <div className="mt-3 text-xs text-muted text-center">
                {coordinates.length === 4 ? 'Four corners captured ✓' : `${coordinates.length} / 4 corners set`}
              </div>
            </>
          )}

          {step === LoomStep.MASKING && (
            <>
              <div className="section-title"><PenTool size={12} /> Defect Masking</div>
              <div className="toast toast-info mb-4">
                <Info size={14} style={{ flexShrink: 0 }} />
                <span>Paint over folds, watermarks or creases. The pipeline will restore these areas.</span>
              </div>
              <div className="mb-4">
                <label className="input-label" htmlFor="brush-size">
                  Brush Size — {brushSize}px
                </label>
                <input
                  id="brush-size"
                  type="range" min={2} max={60} step={2}
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                />
              </div>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-full"
                  onClick={() => canvasRef.current?.clearMask()}
                >
                  Clear Mask Strokes
                </button>
              </div>
              <button
                className="btn btn-ghost btn-sm w-full"
                onClick={() => setStep(LoomStep.CALIBRATING)}
                style={{ marginBottom: '8px' }}
              >
                ← Back to Calibrate
              </button>
            </>
          )}

          {/* Pipeline params shown during CALIBRATING and MASKING */}
          {(step === LoomStep.CALIBRATING || step === LoomStep.MASKING) && (
            <>
              <div className="divider" />
              <PipelineParams
                colorCount={colorCount}   setColorCount={setColorCount}
                targetWidth={targetWidth} setTargetWidth={setTargetWidth}
                customWidth={customWidth} setCustomWidth={setCustomWidth}
              />
              {step === LoomStep.MASKING && (
                <button
                  className="btn btn-primary w-full btn-lg mt-3"
                  onClick={handleRunPipeline}
                  id="run-pipeline-btn"
                >
                  <Cpu size={16} /> Run Pipeline (7 Stages)
                </button>
              )}
            </>
          )}

          {/* Live stage monitor while processing */}
          {step === LoomStep.PROCESSING && (
            <>
              <div className="section-title"><Cpu size={12} /> Processing</div>
              <StageMonitor taskId={taskId} />
            </>
          )}

          {/* Rich results panel after completion */}
          {step === LoomStep.COMPLETE && (
            <>
              <div className="section-title"><CheckCircle2 size={12} /> Results</div>
              <ResultsPanel />
              <button
                className="btn btn-secondary w-full mt-4"
                onClick={handleReset}
                id="process-another-btn"
              >
                <RefreshCw size={14} /> Process Another
              </button>
            </>
          )}

          {/* Error toast */}
          {processError && (
            <div className="toast toast-error mt-3">
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{processError}</span>
            </div>
          )}

          {/* Phase 2 teaser (collapsed to footer) */}
          <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
            <div className="divider mb-4" />
            <Phase2Card />
          </div>
        </aside>

        {/* ── Canvas / main area ────────────────────────────────────────── */}
        <main className="main-content">
          <AnimatePresence mode="wait">
            {step === LoomStep.UPLOADED ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
              >
                {openStudio ? (
                  <>
                    <button type="button" className="btn btn-secondary" style={{ alignSelf: 'start', marginBottom: 12 }}
                      onClick={() => {
                        if (window.confirm('Return to image upload? Save your project first to keep your edits.')) setOpenStudio(false);
                      }}>Back to image upload</button>
                    <DotStudio />
                  </>
                ) : (
                  <>
                    <UploadZone
                      getRootProps={getRootProps}
                      getInputProps={getInputProps}
                      isDragActive={isDragActive}
                    />
                    <button type="button" className="btn btn-secondary" style={{ alignSelf: 'center', marginTop: 16 }}
                      onClick={() => setOpenStudio(true)}>Open an existing Dot Studio project</button>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="workspace"
                initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {/* Mode badges */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="pill pill-gold">
                      <Eye size={11} /> {imageFileRef.current?.name ?? 'Image'}
                    </div>
                    {step === LoomStep.CALIBRATING && <div className="pill pill-indigo"><Crosshair size={10} /> Calibration Mode</div>}
                    {step === LoomStep.MASKING      && <div className="pill pill-indigo"><PenTool size={10} /> Mask Mode</div>}
                    {step === LoomStep.PROCESSING   && <div className="pill pill-dim"><Cpu size={10} /> Processing…</div>}
                    {step === LoomStep.COMPLETE     && <div className="pill pill-green"><CheckCircle2 size={10} /> Complete</div>}
                  </div>
                  {imageFileRef.current && (
                    <span className="text-xs text-muted font-mono">
                      {(imageFileRef.current.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>

                {/* Main Visual Content: Workspace Canvas or Completed Design Inspection */}
                {step === LoomStep.COMPLETE ? (
                  <CompleteWorkspace />
                ) : (
                  <div className="canvas-wrapper" style={{ flex: 1 }}>
                    <LoomCanvas ref={canvasRef} />
                  </div>
                )}

                <StepHint step={step} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────

const UploadZone: React.FC<{
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
}> = ({ getRootProps, getInputProps, isDragActive }) => (
  <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%' }}>
    <div className="text-center mb-6 animate-in">
      <h1 className="text-3xl font-bold gradient-text" style={{ marginBottom: '10px' }}>
        Saree → Loom Design
      </h1>
      <p className="text-secondary" style={{ maxWidth: '440px', margin: '0 auto', lineHeight: 1.7 }}>
        Upload a photograph or screenshot. WeaveCore runs a 7-stage pipeline:
        sharpness check, segmentation, repeat detection, pattern completion,
        Lab quantization, vectorization, and Jacquard-ready BMP + TIFF export.
      </p>
    </div>
    <div className={`dropzone animate-in delay-2 ${isDragActive ? 'drag-active' : ''}`} {...getRootProps()}>
      <input {...getInputProps()} id="file-upload" aria-label="Upload saree image" />
      <div className="dropzone-icon"><ImageIcon size={28} /></div>
      <h2 className="text-xl font-semibold" style={{ marginBottom: '8px' }}>
        {isDragActive ? 'Release to upload' : 'Drop your image here'}
      </h2>
      <p className="text-muted text-sm" style={{ marginBottom: '20px' }}>or click to browse your files</p>
      <div className="flex gap-2" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        {['PNG', 'JPG', 'WEBP', 'BMP', 'TIFF'].map(ext => (
          <span key={ext} className="pill pill-dim">{ext}</span>
        ))}
      </div>
    </div>

    <div className="flex gap-3 mt-6 animate-in delay-3" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
      {[
        '🔍 Sharpness check + Real-ESRGAN',
        '🗺 Region segmentation (MobileSAM)',
        '🔁 Autocorrelation repeat detection',
        '🧩 Symmetry tile completion',
        '🎨 Lab-space colour quantization',
        '✒️ Boundary vectorization',
        '📦 BMP + TIFF + Manifest export',
      ].map(f => (
        <div key={f} className="pill pill-dim" style={{ fontSize: '10px' }}>{f}</div>
      ))}
    </div>
  </div>
);

const PRESET_WIDTHS = [600, 1200, 2400, 3600];

const PipelineParams: React.FC<{
  colorCount: number;   setColorCount: (n: number) => void;
  targetWidth: number;  setTargetWidth: (n: number) => void;
  customWidth: string;  setCustomWidth: (s: string) => void;
}> = ({ colorCount, setColorCount, targetWidth, setTargetWidth, customWidth, setCustomWidth }) => (
  <div>
    <div className="section-title"><Sliders size={12} /> Pipeline Parameters</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label className="input-label" htmlFor="color-count">
          Colour Count — {colorCount} colours
        </label>
        <input id="color-count" type="range" min={2} max={32} step={1} value={colorCount}
          onChange={e => setColorCount(Number(e.target.value))} />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted">2 (minimal)</span>
          <span className="text-xs text-muted">32 (rich)</span>
        </div>
      </div>
      <div>
        <label className="input-label">Loom Hook Width</label>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: '8px' }}>
          {PRESET_WIDTHS.map(w => (
            <button
              key={w}
              id={`width-${w}`}
              className={`btn btn-sm ${!customWidth && targetWidth === w ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTargetWidth(w); setCustomWidth(''); }}
            >
              {w}
            </button>
          ))}
        </div>
        <input
          type="number" className="input"
          placeholder="Custom width (hooks)…"
          value={customWidth} min={100} max={9999}
          onChange={e => setCustomWidth(e.target.value)}
          id="custom-width" aria-label="Custom loom hook width"
        />
      </div>
    </div>
  </div>
);

const STEP_HINTS: Partial<Record<LoomStep, string>> = {
  [LoomStep.CALIBRATING]: 'Drag the four corner pins to the exact corners of the design area. The pipeline uses these to correct perspective distortion.',
  [LoomStep.MASKING]:     'Paint over folds, watermarks or shadows. These regions are inpainted before the rest of the pipeline runs.',
  [LoomStep.PROCESSING]:  'All 7 pipeline stages are running in the backend. Progress updates every 1.5 s.',
  [LoomStep.COMPLETE]:    'Your Jacquard-ready files are ready. Download BMP for loom software, TIFF for Photoshop/GIMP, or JSON for provenance tracking.',
};

const StepHint: React.FC<{ step: LoomStep }> = ({ step }) => {
  const hint = STEP_HINTS[step];
  if (!hint) return null;
  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="toast toast-info"
      style={{ alignItems: 'center' }}
    >
      <Info size={14} style={{ flexShrink: 0 }} />
      <span className="text-sm">{hint}</span>
    </motion.div>
  );
};

const Phase2Card: React.FC = () => (
  <div style={{
    padding: '12px',
    background: 'var(--color-surface-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  }}>
    <div className="flex items-center gap-2 mb-2">
      <Grid3X3 size={12} style={{ color: 'var(--color-indigo)' }} />
      <span className="text-xs font-semibold" style={{ color: 'var(--color-indigo)' }}>Phase 2 Roadmap</span>
    </div>
    <p className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
      Fine-tuned restoration model, full MobileSAM ONNX weights, advanced symmetry detection
      (pmm / p6m), and interactive region correction UI — planned after MVP validation.
    </p>
  </div>
);

const StepBar: React.FC<{ currentIndex: number }> = ({ currentIndex }) => (
  <div className="step-bar" role="progressbar" aria-label="Pipeline progress"
    aria-valuenow={currentIndex} aria-valuemin={0} aria-valuemax={STEPS.length - 1}>
    {STEPS.map((s, idx) => {
      const done   = idx < currentIndex;
      const active = idx === currentIndex;
      return (
        <React.Fragment key={s.id}>
          <div className="step-item" style={{ flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
            <div className="flex items-center gap-2">
              <div className={`step-dot ${done ? 'done' : active ? 'active' : ''}`}>
                {done ? <CheckCircle2 size={12} /> : s.icon}
              </div>
              <span className={`step-label ${done ? 'done' : active ? 'active' : ''}`}>
                {s.label}
              </span>
            </div>
          </div>
          {idx < STEPS.length - 1 && <div className={`step-line ${done ? 'done' : ''}`} />}
        </React.Fragment>
      );
    })}
  </div>
);

export default App;
