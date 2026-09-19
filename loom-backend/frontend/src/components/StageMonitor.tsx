/**
 * StageMonitor — live pipeline stage progress indicator.
 *
 * Shows:
 *   • An animated circular progress arc (SVG)
 *   • Current stage name + percentage
 *   • Scrollable log of all completed stages
 *
 * Used during LoomStep.PROCESSING.
 */
import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { useLoomStore } from '../store/useLoomStore';

interface StageMonitorProps {
  taskId: string;
}

// ── Named pipeline stages (ordered) ─────────────────────────────────────
const NAMED_STAGES = [
  { key: 'restoration',   label: 'Sharpness Check',      pct: 15  },
  { key: 'repair',        label: 'Defect Repair',         pct: 20  },
  { key: 'deskew',        label: 'Perspective Deskew',    pct: 25  },
  { key: 'segmentation',  label: 'Region Segmentation',   pct: 45  },
  { key: 'lattice',       label: 'Repeat Detection',       pct: 55  },
  { key: 'completion',    label: 'Pattern Completion',     pct: 65  },
  { key: 'quantization',  label: 'Colour Quantization',   pct: 75  },
  { key: 'vectorization', label: 'Vectorization',          pct: 83  },
  { key: 'export',        label: 'Export (BMP/TIFF/JSON)', pct: 100 },
];

// ── SVG progress ring ────────────────────────────────────────────────────
const R = 46;
const CIRCUMFERENCE = 2 * Math.PI * R;

const ProgressRing: React.FC<{ pct: number }> = ({ pct }) => {
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
      {/* Track */}
      <circle cx="56" cy="56" r={R} fill="none" stroke="var(--color-border)" strokeWidth="6" />
      {/* Progress */}
      <motion.circle
        cx="56" cy="56" r={R}
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        animate={{ strokeDashoffset: dashOffset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ transformOrigin: '56px 56px', transform: 'rotate(-90deg)' }}
      />
      {/* Percentage text */}
      <text
        x="56" y="56"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-gold)"
        fontFamily="var(--font-mono)"
        fontSize="16"
        fontWeight="700"
      >
        {pct}%
      </text>
    </svg>
  );
};

// ── Main component ────────────────────────────────────────────────────────
const StageMonitor: React.FC<StageMonitorProps> = ({ taskId }) => {
  const pipelineStage    = useLoomStore(s => s.pipelineStage);
  const pipelineProgress = useLoomStore(s => s.pipelineProgress);
  const pipelineLog      = useLoomStore(s => s.pipelineLog);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [pipelineLog]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y:  0 }}
      exit={{   opacity: 0, y: -8  }}
      transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* ── Hero ring ── */}
      <div className="flex items-center gap-5" style={{
        padding: '20px',
        background: 'var(--color-surface-3)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        <ProgressRing pct={pipelineProgress} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="spinner" />
            <span className="text-sm font-semibold">Pipeline Running</span>
          </div>
          <div
            className="text-xs"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)', marginBottom: '6px' }}
          >
            {pipelineStage || 'Initialising…'}
          </div>
          {taskId && (
            <div className="text-xs text-muted font-mono">
              task: {taskId.slice(0, 20)}…
            </div>
          )}
        </div>
      </div>

      {/* ── Stage checklist ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {NAMED_STAGES.map((s) => {
          const done    = pipelineProgress >= s.pct;
          const active  = !done && pipelineStage.toLowerCase().startsWith(s.key);
          return (
            <div
              key={s.key}
              className="flex items-center gap-3"
              style={{ opacity: done || active ? 1 : 0.4, transition: 'opacity 0.3s' }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: done
                  ? 'rgba(62,207,142,0.15)'
                  : active
                    ? 'rgba(200,155,60,0.15)'
                    : 'var(--color-surface-3)',
                border: `1px solid ${done ? 'var(--color-success)' : active ? 'var(--color-gold)' : 'var(--color-border)'}`,
                color: done ? 'var(--color-success)' : active ? 'var(--color-gold)' : 'var(--color-text-muted)',
              }}>
                {done ? '✓' : active ? '⟳' : '○'}
              </div>
              <span className="text-xs" style={{
                color: done
                  ? 'var(--color-success)'
                  : active
                    ? 'var(--color-gold)'
                    : 'var(--color-text-muted)',
              }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Scrollable log ── */}
      {pipelineLog.length > 0 && (
        <div
          ref={logRef}
          style={{
            maxHeight: '130px', overflowY: 'auto',
            padding: '10px 12px',
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            lineHeight: '1.8',
            color: 'var(--color-text-muted)',
          }}
          aria-live="polite"
          aria-label="Pipeline log"
        >
          {pipelineLog.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default StageMonitor;
