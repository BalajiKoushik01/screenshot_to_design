/**
 * ResultsPanel — rich export + analysis display for a completed pipeline run.
 *
 * Sections:
 *   1. Export downloads (BMP, TIFF, Manifest JSON)
 *   2. Region segmentation table (label, confidence, area)
 *   3. Repeat / lattice detection summary
 *   4. Stage 0 metadata (sharpness score, restoration flag)
 */
import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, FileJson, Layers, Grid3X3, CheckCircle2,
  Zap, ChevronDown, ChevronUp, AlertTriangle, Archive, RefreshCw,
} from 'lucide-react';
import { useLoomStore } from '../store/useLoomStore';
import { REGION_COLORS } from '../types';
import type { RegionData, RepeatData } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

const SYMMETRY_INFO: Record<string, string> = {
  p1:      'Oblique — no special symmetry',
  p2:      'Rectangular — 2-fold rotation',
  p4:      'Square — 4-fold rotation',
  p4m:     'Square + mirror — highest symmetry (p4m)',
  pmm:     'Rectangular + mirror (pmm)',
  unknown: 'Could not determine',
};

function fmt(n: number, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

// ── Region row ────────────────────────────────────────────────────────────

const RegionRow: React.FC<{ region: RegionData }> = ({ region }) => {
  const dotColor = REGION_COLORS[region.label] ?? '#888';
  return (
    <div className="flex items-center gap-3" style={{
      padding: '8px 10px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-surface-3)',
      border: '1px solid var(--color-border)',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
        background: dotColor, boxShadow: `0 0 6px ${dotColor}55`,
      }} />
      <span className="text-xs font-semibold" style={{ flex: 1, textTransform: 'capitalize' }}>
        {region.label}
      </span>
      <span className="text-xs text-muted font-mono">
        {Math.round(region.confidence * 100)}% conf
      </span>
      <span className="text-xs text-muted font-mono">
        {region.area_px.toLocaleString()} px
      </span>
      <span className="text-xs text-muted" style={{ textTransform: 'capitalize' }}>
        {region.metadata?.method as string ?? ''}
      </span>
    </div>
  );
};

// ── Download card ─────────────────────────────────────────────────────────

interface DownloadCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  primary?: boolean;
  filename: string;
}

const DownloadCard: React.FC<DownloadCardProps> = ({
  href, icon, title, subtitle, primary, filename,
}) => {
  const [downloading, setDownloading] = useState(false);
  if (!href) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const resp = await axios.get(href, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Axios blob download failed, falling back to direct link:', err);
      window.open(href, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} w-full`}
      style={{
        justifyContent: 'flex-start',
        gap: '10px',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '10px 14px',
      }}
    >
      <span style={{ opacity: 0.85, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: '10px', opacity: 0.65 }}>{subtitle}</span>
      </span>
      {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} style={{ flexShrink: 0 }} />}
    </button>
  );
};

// ── Collapsible section ───────────────────────────────────────────────────

const Collapsible: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title, icon, children, defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden',
    }}>
      <button
        className="w-full flex items-center gap-2"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '10px 12px',
          background: 'var(--color-surface-3)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span style={{ color: 'var(--color-gold)' }}>{icon}</span>
        <span className="text-xs font-semibold" style={{ flex: 1 }}>{title}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{   height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────

const ResultsPanel: React.FC = () => {
  const downloadUrl   = useLoomStore(s => s.downloadUrl);
  const tiffUrl       = useLoomStore(s => s.tiffUrl);
  const manifestUrl   = useLoomStore(s => s.manifestUrl);
  const taskId        = useLoomStore(s => s.taskId);
  const regions       = useLoomStore(s => s.regions);
  const repeat        = useLoomStore(s => s.repeat) as RepeatData | null;
  const sharpness     = useLoomStore(s => s.sharpness);
  const restApplied   = useLoomStore(s => s.restorationApplied);
  const pipelineLog   = useLoomStore(s => s.pipelineLog);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
        <span className="font-semibold text-success">Pipeline Complete</span>
      </div>

      {/* ── Downloads ── */}
      <Collapsible title="Downloads" icon={<Download size={12} />} defaultOpen>
        <DownloadCard
          href={taskId ? `/api/v1/designs/${taskId}/download/bmp` : downloadUrl}
          filename="loom_design.bmp"
          icon={<Grid3X3 size={15} />}
          title="Jacquard BMP"
          subtitle="8-bit indexed · loom control software compatible"
          primary
        />
        <DownloadCard
          href={taskId ? `/api/v1/designs/${taskId}/download/tiff` : tiffUrl}
          filename="loom_design_layered.tiff"
          icon={<Layers size={15} />}
          title="Layered TIFF"
          subtitle="One RGBA layer per colour · LZW compressed"
        />
        <DownloadCard
          href={taskId ? `/api/v1/designs/${taskId}/download/manifest` : manifestUrl}
          filename="pipeline_manifest.json"
          icon={<FileJson size={15} />}
          title="Pipeline Manifest"
          subtitle="Full provenance JSON (regions, repeat, logs)"
        />
        {taskId && (
          <>
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/jeri`}
              filename="saree_zari_jeri.bmp"
              icon={<Grid3X3 size={15} />}
              title="Zari Card Plane (_jeri.bmp)"
              subtitle="1-bit monochrome · extra-weft Zari card punch"
              primary
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/ani`}
              filename="saree_silk_ani.bmp"
              icon={<Grid3X3 size={15} />}
              title="Silk Tabby Plane (_ani.bmp)"
              subtitle="1-bit monochrome · ground plain weave checkerboard"
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/body`}
              filename="saree_body_repeat.bmp"
              icon={<Grid3X3 size={15} />}
              title="Body Repeat File (_body.bmp)"
              subtitle="Isolated body repeat draft (half-drop buttas)"
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/pallu`}
              filename="saree_pallu_medallion.bmp"
              icon={<Grid3X3 size={15} />}
              title="Pallu Draft File (_pallu.bmp)"
              subtitle="Isolated grand pallu / anchal centerpiece draft"
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/wif`}
              filename="saree_master_draft.wif"
              icon={<FileJson size={15} />}
              title="Universal Loom File (.WIF)"
              subtitle="WeavePoint, SwiftWeave, Fiberworks PCW compatible"
              primary
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/dat`}
              filename="saree_jacquard_card_punch.dat"
              icon={<Grid3X3 size={15} />}
              title="Electronic Loom Punch (.DAT)"
              subtitle="Stäubli JC5/6 & Bonas controller compatible binary"
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/svg`}
              filename="saree_jacquard_grid.svg"
              icon={<Layers size={15} />}
              title="Vector Technical Grid (.SVG)"
              subtitle="Scalable 1:1 needle hook & pick coordinate rules"
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/techpack`}
              filename="weavecore_techpack_job_sheet.html"
              icon={<FileJson size={15} />}
              title="Mill Production Tech Pack (HTML)"
              subtitle="Printable weaver job docket with yarn metrics & EPI/PPI"
              primary
            />
            <DownloadCard
              href={`/api/v1/designs/${taskId}/download/psp_bundle`}
              filename="paintshop_pro_jacquard_cad_bundle.zip"
              icon={<Archive size={15} />}
              title="PaintShop Pro CAD Suite (ZIP)"
              subtitle="Full suite (Body, Pallu, Jeri, Ani, PAL, instructions)"
              primary
            />
          </>
        )}
        {taskId && (
          <DownloadCard
            href={`/api/v1/designs/${taskId}/download/master_2d`}
            filename="saree_2D_master_design.bmp"
            icon={<Grid3X3 size={15} />}
            title="2D Master Repeat (BMP)"
            subtitle="Clean 2D pattern repeat · human/room isolated"
          />
        )}
        {taskId && (
          <DownloadCard
            href={`/api/v1/designs/${taskId}/download/zip`}
            filename="weavecore_design_package.zip"
            icon={<Archive size={15} />}
            title="Standard Design Package (ZIP)"
            subtitle="Jacquard BMP + layered TIFF + manifest JSON"
          />
        )}
      </Collapsible>

      {/* ── Region segmentation ── */}
      {regions.length > 0 && (
        <Collapsible title={`Segmentation — ${regions.length} regions`} icon={<Zap size={12} />}>
          {regions.map((r, i) => <RegionRow key={i} region={r} />)}
        </Collapsible>
      )}

      {/* ── Repeat detection ── */}
      {repeat && (
        <Collapsible title="Repeat / Lattice" icon={<Grid3X3 size={12} />} defaultOpen={false}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Period X',  value: repeat.vector_x > 0 ? `${repeat.vector_x} px` : 'not detected' },
              { label: 'Period Y',  value: repeat.vector_y > 0 ? `${repeat.vector_y} px` : 'not detected' },
              { label: 'Confidence', value: `${Math.round(repeat.confidence * 100)}%` },
              { label: 'Symmetry',  value: repeat.symmetry_group },
            ].map(kv => (
              <div key={kv.label} style={{
                padding: '8px 10px',
                background: 'var(--color-surface-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}>
                <div className="text-xs text-muted">{kv.label}</div>
                <div className="text-xs font-semibold font-mono">{kv.value}</div>
              </div>
            ))}
          </div>
          {repeat.symmetry_group !== 'unknown' && (
            <div className="text-xs text-muted" style={{ lineHeight: 1.6, marginTop: '4px' }}>
              {SYMMETRY_INFO[repeat.symmetry_group] ?? repeat.symmetry_group}
            </div>
          )}
        </Collapsible>
      )}

      {/* ── Stage 0 metadata ── */}
      <Collapsible title="Image Quality" icon={<Zap size={12} />} defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{
            padding: '8px 10px',
            background: 'var(--color-surface-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}>
            <div className="text-xs text-muted">Sharpness (Laplacian)</div>
            <div className="text-xs font-semibold font-mono">
              {sharpness !== null ? fmt(sharpness) : '—'}
            </div>
          </div>
          <div style={{
            padding: '8px 10px',
            background: restApplied ? 'rgba(62,207,142,0.08)' : 'var(--color-surface-3)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${restApplied ? 'rgba(62,207,142,0.3)' : 'var(--color-border)'}`,
          }}>
            <div className="text-xs text-muted">Restoration</div>
            <div className={`text-xs font-semibold ${restApplied ? 'text-success' : ''}`}>
              {restApplied ? 'Applied' : 'Not needed'}
            </div>
          </div>
        </div>
        {sharpness !== null && sharpness < 100 && !restApplied && (
          <div className="toast toast-warning" style={{ marginTop: '4px' }}>
            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
            <span className="text-xs">
              Low sharpness ({fmt(sharpness)}). Real-ESRGAN weights not found — using classical denoising.
            </span>
          </div>
        )}
      </Collapsible>

      {/* ── Pipeline log (collapsed by default) ── */}
      {pipelineLog.length > 0 && (
        <Collapsible title="Pipeline Log" icon={<FileJson size={12} />} defaultOpen={false}>
          <div style={{
            maxHeight: '150px', overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            lineHeight: 1.9,
            color: 'var(--color-text-muted)',
          }}>
            {pipelineLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </Collapsible>
      )}
    </motion.div>
  );
};

export default ResultsPanel;
