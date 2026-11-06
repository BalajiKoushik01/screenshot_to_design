import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Eye,
  Grid3X3,
  Layers,
  FileJson,
  Archive,
  RefreshCw,
  Maximize2,
  Sliders,
  CheckCircle2,
  Columns,
  Sparkles,
  Info,
  Palette,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import { useLoomStore } from '../store/useLoomStore';
import { REGION_COLORS } from '../types';
import DotStudio from './DotStudio';

type ViewMode = 'photo_trace' | 'dot_studio' | 'master_2d' | 'motif' | 'border' | 'tech_sheet' | 'psp' | 'jacquard' | 'comparison' | 'regions' | 'repeat' | 'colorway' | 'copilot';

const triggerFileDownload = async (url: string, defaultFilename: string) => {
  try {
    const res = await axios.get(url, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.warn('Direct blob download error, opening link:', err);
    window.open(url, '_blank');
  }
};

const CompleteWorkspace: React.FC = () => {
  const {
    imagePath,
    previewUrl,
    downloadUrl,
    tiffUrl,
    manifestUrl,
    taskId,
    palette,
    regions,
    repeat,
    pipelineResult,
  } = useLoomStore((s) => ({
    imagePath:      s.imagePath,
    previewUrl:     s.previewUrl,
    downloadUrl:    s.downloadUrl,
    tiffUrl:        s.tiffUrl,
    manifestUrl:    s.manifestUrl,
    taskId:         s.taskId,
    palette:        s.palette,
    regions:        s.regions,
    repeat:         s.repeat,
    pipelineResult: s.pipelineResult,
  }));

  const [mode, setMode] = useState<ViewMode>(pipelineResult?.jeri_preview_url ? 'dot_studio' : 'master_2d');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [regionOpacity, setRegionOpacity] = useState<number>(0.65);
  const [hoveredRegionIdx, setHoveredRegionIdx] = useState<number | null>(null);
  const [repeatGridSize, setRepeatGridSize] = useState<number>(3);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Pixel-accurate inspection state
  const [zoom, setZoom] = useState<number>(1);
  const [showPixelGrid, setShowPixelGrid] = useState<boolean>(false);
  const [hoveredHook, setHoveredHook] = useState<{ x: number; y: number } | null>(null);

  // PaintShop Pro Studio state
  const [pspSubView, setPspSubView] = useState<'panel' | 'body' | 'pallu' | 'border' | 'jeri' | 'ani' | 'motif' | 'master'>('panel');
  const [pspColorMode, setPspColorMode] = useState<'authentic' | 'blue' | 'redwhite' | 'indexed'>('authentic');
  const [pspGridMode, setPspGridMode] = useState<'none' | '1px' | '8x8'>('1px');
  const [pspZoom, setPspZoom] = useState<number>(4); // 1, 2, 4, 8, 16
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [showCloudAiModal, setShowCloudAiModal] = useState<boolean>(false);
  const [hfToken, setHfToken] = useState<string>(() => localStorage.getItem('hf_token') || '');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [aiConfigSaving, setAiConfigSaving] = useState<boolean>(false);
  const [aiConfigSuccess, setAiConfigSuccess] = useState<boolean>(false);

  // Colorway Studio state
  const [cwGround, setCwGround] = useState<string>('#0B2559');
  const [cwZari, setCwZari] = useState<string>('#E6ECF5');
  const [cwLoading, setCwLoading] = useState<boolean>(false);
  const [cwResult, setCwResult] = useState<{ preview_url: string; bmp_url: string; pal_url: string; ground_hex: string; zari_hex: string; preset_name?: string } | null>(null);

  // LoomAI Co-Pilot state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; provider?: string }>>([
    {
      role: 'assistant',
      text: 'Namaste! I am your AI Master Weaver and Loom CAD Consultant. I have analyzed your saree design parameters (hooks, picks, ground weave, and borders). How can I assist you with loom setup, yarn specification, or card punching today?',
      provider: 'WeaveCore Master Weaver AI',
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  const handleApplyColorway = async (ground: string, zari: string, presetName = 'custom') => {
    if (!taskId) return;
    setCwLoading(true);
    try {
      const res = await axios.post(`/api/v1/designs/${taskId}/generate-colorway`, {
        ground_hex: ground,
        zari_hex: zari,
        preset_name: presetName,
      });
      setCwResult(res.data);
    } catch (err) {
      console.error('Failed to generate colorway:', err);
    } finally {
      setCwLoading(false);
    }
  };

  const handleSendChatMessage = async (q?: string) => {
    const question = q || chatInput;
    if (!question.trim() || !taskId || chatLoading) return;
    const userMsg = { role: 'user' as const, text: question };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!q) setChatInput('');
    setChatLoading(true);
    try {
      const res = await axios.post(`/api/v1/designs/${taskId}/ai-chat`, { question });
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.data.answer,
          provider: res.data.provider,
        }
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Apologies, I encountered an issue connecting to the Master Weaver engine. Please ensure the backend is running.',
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const cacheBuster = taskId ? `?v=${encodeURIComponent(taskId)}` : '';
  const master2dSrc = (pipelineResult?.master_2d_preview_url || previewUrl || downloadUrl) + (pipelineResult?.master_2d_preview_url ? cacheBuster : '');
  const motifSrc    = (pipelineResult?.motif_preview_url || master2dSrc) + (pipelineResult?.motif_preview_url ? cacheBuster : '');
  const borderSrc   = (pipelineResult?.border_preview_url || master2dSrc) + (pipelineResult?.border_preview_url ? cacheBuster : '');
  const rawQuantSrc = pipelineResult?.raw_quant_preview_url || previewUrl || downloadUrl;
  const activeDesignSrc = master2dSrc;

  const pspPanelAuthSrc = pipelineResult?.saree_panel_authentic_preview_url ? `${pipelineResult.saree_panel_authentic_preview_url}${cacheBuster}` : (pipelineResult?.saree_panel_blue_preview_url ? `${pipelineResult.saree_panel_blue_preview_url}${cacheBuster}` : master2dSrc);
  const pspPanelBlueSrc = pipelineResult?.saree_panel_blue_preview_url ? `${pipelineResult.saree_panel_blue_preview_url}${cacheBuster}` : master2dSrc;
  const pspPanelRwSrc   = pipelineResult?.saree_panel_redwhite_preview_url ? `${pipelineResult.saree_panel_redwhite_preview_url}${cacheBuster}` : master2dSrc;
  const pspPanelIndSrc  = pipelineResult?.saree_panel_preview_url ? `${pipelineResult.saree_panel_preview_url}${cacheBuster}` : master2dSrc;

  const pspBodySrc  = pipelineResult?.body_preview_url ? `${pipelineResult.body_preview_url}${cacheBuster}` : pspPanelAuthSrc;
  const pspPalluSrc = pipelineResult?.pallu_preview_url ? `${pipelineResult.pallu_preview_url}${cacheBuster}` : pspPanelAuthSrc;
  const pspJeriSrc  = pipelineResult?.jeri_preview_url ? `${pipelineResult.jeri_preview_url}${cacheBuster}` : pspPanelBlueSrc;
  const pspAniSrc   = pipelineResult?.ani_preview_url ? `${pipelineResult.ani_preview_url}${cacheBuster}` : pspPanelRwSrc;

  const pspMasterBlueSrc = pipelineResult?.master_2d_blue_preview_url ? `${pipelineResult.master_2d_blue_preview_url}${cacheBuster}` : master2dSrc;
  const pspMasterRwSrc  = pipelineResult?.master_2d_redwhite_preview_url ? `${pipelineResult.master_2d_redwhite_preview_url}${cacheBuster}` : master2dSrc;

  let pspActiveSrc = pspPanelAuthSrc;
  if (pspSubView === 'panel') {
    if (pspColorMode === 'authentic') pspActiveSrc = pspPanelAuthSrc;
    else if (pspColorMode === 'blue') pspActiveSrc = pspPanelBlueSrc;
    else if (pspColorMode === 'redwhite') pspActiveSrc = pspPanelRwSrc;
    else pspActiveSrc = pspPanelIndSrc;
  } else if (pspSubView === 'body') {
    pspActiveSrc = pspBodySrc;
  } else if (pspSubView === 'pallu') {
    pspActiveSrc = pspPalluSrc;
  } else if (pspSubView === 'jeri') {
    pspActiveSrc = pspJeriSrc;
  } else if (pspSubView === 'ani') {
    pspActiveSrc = pspAniSrc;
  } else if (pspSubView === 'master') {
    if (pspColorMode === 'authentic') pspActiveSrc = master2dSrc;
    else if (pspColorMode === 'blue') pspActiveSrc = pspMasterBlueSrc;
    else if (pspColorMode === 'redwhite') pspActiveSrc = pspMasterRwSrc;
    else pspActiveSrc = master2dSrc;
  } else if (pspSubView === 'motif') {
    pspActiveSrc = motifSrc;
  } else if (pspSubView === 'border') {
    pspActiveSrc = borderSrc;
  }

  const handleDownload = async (key: string, url: string, filename: string) => {
    setDownloading(key);
    await triggerFileDownload(url, filename);
    setDownloading(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const normX = clickX / rect.width;
    const normY = clickY / rect.height;
    const isPanel = mode === 'psp' && pspSubView === 'panel';
    const totalHooks = isPanel
      ? (pipelineResult?.production_specs?.saree_panel_hooks || 384)
      : (pipelineResult?.production_specs?.warp_hooks || 960);
    const totalPicks = isPanel
      ? (pipelineResult?.production_specs?.saree_panel_picks || 2112)
      : (pipelineResult?.production_specs?.weft_picks || 960);
    const hookX = Math.min(totalHooks, Math.max(1, Math.floor(normX * totalHooks) + 1));
    const pickY = Math.min(totalPicks, Math.max(1, Math.floor(normY * totalPicks) + 1));
    setHoveredHook({ x: hookX, y: pickY });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* ── Top Workspace Bar: View Modes & Quick Exports ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '10px 16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--color-surface-2)', padding: '4px', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
          {pipelineResult?.photo_trace_url && (
            <button type="button"
              className={`btn btn-sm ${mode === 'photo_trace' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('photo_trace')}>
              <Eye size={13} /> Edit photo trace
            </button>
          )}
          {pipelineResult?.jeri_preview_url && (
            <button type="button"
              className={`btn btn-sm ${mode === 'dot_studio' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('dot_studio')}>
              <Grid3X3 size={13} /> Dot Studio
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm ${mode === 'master_2d' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('master_2d')}
            title="Pure 2D Textile Design (Human & Room Removed)"
            id="tab-master-2d"
          >
            <Sparkles size={13} /> 🥻 2D Master Design
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'motif' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('motif')}
            title="Isolated 2D Butta / Motif"
            id="tab-motif"
          >
            ✨ Isolated Butta
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'border' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('border')}
            title="Repeating Zari Border Strip"
            id="tab-border"
          >
            🌿 Zari Border
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'comparison' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('comparison')}
            title="Compare Original Photo vs 2D Master Design"
          >
            <Columns size={13} /> Side-by-Side
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'repeat' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('repeat')}
            title="Seamless Loom Repeat Tiling"
          >
            <Grid3X3 size={13} /> Loom Repeat Grid
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'regions' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('regions')}
            title="Overlay Detected Saree Regions"
          >
            <Layers size={13} /> Saree Regions ({regions.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'tech_sheet' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('tech_sheet')}
            title="Real-life Jacquard Loom Technical Specification & Yarn Sheet"
            id="tab-tech-sheet"
          >
            <Sliders size={13} /> 📋 Loom Tech Sheet
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'psp' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('psp')}
            title="Corel PaintShop Pro Jacquard CAD Suite & Binary Red/White Card Drafts"
            id="tab-psp-studio"
            style={{
              borderColor: mode === 'psp' ? 'var(--color-primary)' : 'rgba(243, 104, 224, 0.4)',
              color: mode === 'psp' ? '#fff' : '#f368e0',
              fontWeight: 600,
            }}
          >
            <Palette size={13} /> 🎨 PaintShop Pro Studio
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'jacquard' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('jacquard')}
            title="Direct Calibrated Photo Quantization"
          >
            📐 Calibrated Photo
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'colorway' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('colorway')}
            title="Interactive Saree Colorway Studio (Royal Sapphire, Bridal Crimson, Emerald, etc.)"
            id="tab-colorway-studio"
            style={{
              borderColor: mode === 'colorway' ? 'var(--color-primary)' : 'rgba(234, 179, 8, 0.4)',
              color: mode === 'colorway' ? '#fff' : '#facc15',
              fontWeight: 600,
            }}
          >
            🌈 Colorway Studio
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'copilot' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('copilot')}
            title="LoomAI Master Weaver Co-Pilot & Technical Advisory"
            id="tab-copilot"
            style={{
              borderColor: mode === 'copilot' ? 'var(--color-primary)' : 'rgba(168, 85, 247, 0.4)',
              color: mode === 'copilot' ? '#fff' : '#c084fc',
              fontWeight: 600,
            }}
          >
            🤖 LoomAI Co-Pilot
          </button>
        </div>

        {/* Quick Export Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCloudAiModal(true)}
            title="Intelligent Cloud Open-Source AI Pattern Understanding (Hugging Face Serverless)"
            id="cloud-ai-btn"
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              borderColor: 'rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={13} />
            <span>🤖 Cloud AI Agent</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleDownload('psp_bundle', `/api/v1/designs/${taskId}/download/psp_bundle`, 'paintshop_pro_jacquard_cad_bundle.zip')}
            disabled={downloading === 'psp_bundle'}
            title="Download Complete PaintShop Pro Jacquard CAD Package (.zip)"
            id="download-psp-bundle-btn"
            style={{ background: 'linear-gradient(135deg, #c00000 0%, #7c1a22 100%)', border: '1px solid #ff7675' }}
          >
            {downloading === 'psp_bundle' ? <RefreshCw size={13} className="animate-spin" /> : <Archive size={13} />}
            <span>🎨 PSP Suite (.zip)</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDownload('master_2d', `/api/v1/designs/${taskId}/download/master_2d`, 'saree_2D_master_design.bmp')}
            disabled={downloading === 'master_2d'}
            title="Download 2D Master Jacquard Design (Human & Room Removed)"
            id="download-master-bmp-btn"
          >
            {downloading === 'master_2d' ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
            <span>2D Design (BMP)</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDownload('wif', `/api/v1/designs/${taskId}/download/wif`, 'saree_master_draft.wif')}
            disabled={downloading === 'wif'}
            title="Download Universal Weaving Information File (.wif for WeavePoint / SwiftWeave)"
            id="download-wif-btn"
          >
            <FileJson size={13} />
            <span>.WIF</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDownload('dat', `/api/v1/designs/${taskId}/download/dat`, 'saree_jacquard_card_punch.dat')}
            disabled={downloading === 'dat'}
            title="Download Electronic Jacquard Loom Punch Format (.dat for Stäubli / Bonas)"
            id="download-dat-btn"
          >
            <Grid3X3 size={13} />
            <span>.DAT</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDownload('svg', `/api/v1/designs/${taskId}/download/svg`, 'saree_jacquard_grid.svg')}
            disabled={downloading === 'svg'}
            title="Download Technical Vector Jacquard Grid (.svg)"
            id="download-svg-btn"
          >
            <Layers size={13} />
            <span>.SVG</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.open(`/api/v1/designs/${taskId}/download/techpack`, '_blank')}
            title="Open & Print Mill Technical Job Sheet / Tech Pack (.html)"
            id="download-techpack-btn"
          >
            <BookOpen size={13} />
            <span>Tech Pack</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDownload('zip', `/api/v1/designs/${taskId}/download/zip`, 'weavecore_design_package.zip')}
            disabled={downloading === 'zip'}
            title="Download Complete Package (.zip)"
            id="download-zip-btn"
          >
            {downloading === 'zip' ? <RefreshCw size={13} className="animate-spin" /> : <Archive size={13} />}
            <span>All (.zip)</span>
          </button>
        </div>
      </div>

      {/* ── Secondary Pixel-Accuracy & Zoom Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '6px 16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="text-muted font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pixel Inspection:
          </span>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-2)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                type="button"
                className={`btn btn-xs ${zoom === z ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setZoom(z)}
                style={{ minWidth: '46px' }}
              >
                {z * 100}%
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={showPixelGrid}
              onChange={(e) => setShowPixelGrid(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ color: showPixelGrid ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
              1x1 Hook Grid Overlay
            </span>
          </label>
        </div>

        {/* Live Hook Coordinate HUD */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'monospace' }}>
          {hoveredHook ? (
            <div style={{ display: 'flex', gap: '12px', background: 'var(--color-surface-3)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-accent)' }}>
                Warp Hook: <strong>#{hoveredHook.x}</strong>
              </span>
              <span>•</span>
              <span style={{ color: 'var(--color-accent)' }}>
                Weft Pick: <strong>#{hoveredHook.y}</strong>
              </span>
            </div>
          ) : (
            <span className="text-muted text-xs">
              Hover cursor over design for exact Warp/Weft Hook coordinates
            </span>
          )}
        </div>
      </div>

      {/* ── Extracted Color Palette Bar ── */}
      {palette && palette.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflowX: 'auto',
          }}
        >
          <span className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Palette ({palette.length} colors):
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {palette.map((c, i) => {
              const isSelected = selectedColor === c.hex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedColor(isSelected ? null : c.hex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--color-surface-3)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title={`Color ${i + 1}: ${c.hex} (${c.percentage}%)`}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: c.hex,
                      boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                      display: 'inline-block',
                    }}
                  />
                  <span className="font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
                    {c.hex}
                  </span>
                  <span className="text-xs text-muted">
                    {c.percentage}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Canvas/Viewer Area ── */}
      <div
        className="canvas-wrapper"
        style={{
          flex: 1,
          minHeight: '520px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          overflow: 'auto',
          padding: '24px',
        }}
      >
        {/* VIEW 0: Pure 2D Master Jacquard Design (Human & Room Removed) */}
        {pipelineResult?.photo_trace_url && (
          <div hidden={mode !== 'photo_trace'} style={{ width: '100%', minWidth: 0 }}>
            <details style={{ marginBottom: 12 }}>
              <summary>Compare with the calibrated photo crop</summary>
              <p>Pin the corners around one visible border or motif before processing. The trace follows visible contrast and may include folds or shadows.</p>
              <img src={pipelineResult.photo_reference_url} alt="Calibrated photo crop"
                style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }} />
            </details>
            <DotStudio key={pipelineResult.photo_trace_url} source={pipelineResult.photo_trace_url} />
          </div>
        )}
        {pipelineResult?.jeri_preview_url && (
          <div hidden={mode !== 'dot_studio'} style={{ width: '100%', minWidth: 0 }}>
            <DotStudio key={pipelineResult.jeri_preview_url} source={pipelineResult.jeri_preview_url} />
          </div>
        )}
        {mode === 'master_2d' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'auto',
                border: '1px solid var(--color-border)',
                background: '#05070d',
                maxHeight: 'calc(100vh - 360px)',
                maxWidth: '100%',
                position: 'relative',
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  position: 'relative',
                  cursor: 'crosshair',
                }}
              >
                <img
                  src={master2dSrc}
                  alt="2D Master Jacquard Design"
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoveredHook(null)}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 380px)',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                  }}
                  id="master-2d-image"
                />
                {showPixelGrid && zoom >= 2 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)`,
                      backgroundSize: `${zoom * 2}px ${zoom * 2}px`,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted font-mono items-center">
              <span className="text-accent font-semibold flex items-center gap-1">
                <Sparkles size={12} /> Pure 2D Textile Space
              </span>
              <span>•</span>
              <span>Human Model & Room Excluded</span>
              <span>•</span>
              <span>Zoom: {zoom * 100}% (Pixel Accurate)</span>
              <span>•</span>
              <span>Loom Weave-Card Ready</span>
            </div>
          </div>
        )}

        {/* VIEW 1: Isolated Butta / Motif */}
        {mode === 'motif' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'auto',
                border: '1px solid var(--color-border)',
                background: '#05070d',
                maxHeight: 'calc(100vh - 360px)',
                padding: '16px',
                cursor: 'crosshair',
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease',
                  position: 'relative',
                }}
              >
                <img
                  src={motifSrc}
                  alt="Isolated Butta Motif"
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoveredHook(null)}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 380px)',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                  }}
                  id="isolated-motif-image"
                />
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted font-mono">
              <span className="text-accent">Isolated 2D Motif Element</span>
              <span>•</span>
              <span>Cleaned Zari Embroidery</span>
              <span>•</span>
              <span>Pixel Accurate 1:1 Hooks</span>
            </div>
          </div>
        )}

        {/* VIEW 2: Repeating Zari Border Strip */}
        {mode === 'border' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'auto',
                border: '1px solid var(--color-border)',
                background: '#05070d',
                maxHeight: 'calc(100vh - 360px)',
                padding: '12px',
                cursor: 'crosshair',
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  position: 'relative',
                }}
              >
                <img
                  src={borderSrc}
                  alt="Continuous Zari Border"
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoveredHook(null)}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 380px)',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                  }}
                  id="zari-border-image"
                />
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted font-mono">
              <span className="text-accent">Continuous Zari Border Strip</span>
              <span>•</span>
              <span>Loom Edge Band</span>
              <span>•</span>
              <span>Quantized Vector Repeat</span>
            </div>
          </div>
        )}

        {/* VIEW: Real-life Jacquard Loom Technical Specification Sheet */}
        {mode === 'tech_sheet' && (
          <div
            style={{
              width: '100%',
              maxWidth: '960px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Electronic Jacquard Loom Technical Production Sheet
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Card punch & electronic head specification for direct industrial weaving
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleDownload('master_2d', `/api/v1/designs/${taskId}/download/master_2d`, 'saree_2D_master_design.bmp')}
              >
                <Download size={13} /> Download Loom BMP (8-Bit)
              </button>
            </div>

            {/* Loom Technical Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Loom Compatibility</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-accent)' }}>
                  Bonas / Staubli / Song & Song
                </p>
              </div>
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Total Warp Hooks</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  {pipelineResult?.production_specs?.warp_hooks || 960} Hooks
                </p>
              </div>
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Total Weft Picks</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  {pipelineResult?.production_specs?.weft_picks || 960} Picks
                </p>
              </div>
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Loom Density (EPI / PPI)</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  120 EPI × 96 PPI
                </p>
              </div>
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Physical Repeat Size</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  {pipelineResult?.production_specs?.physical_width_inches || '8.00'}" × {pipelineResult?.production_specs?.physical_height_inches || '10.00'}"
                </p>
              </div>
              <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase' }}>Palette Encoding</span>
                <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                  8-Bit Indexed Palette (Zero Bleed)
                </p>
              </div>
            </div>

            {/* Production Yarn Assignment Table */}
            <div style={{ marginTop: '8px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Yarn Assignment & Weft Insertion Plan
              </h4>
              <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '8px 12px' }}>Color Index</th>
                      <th style={{ padding: '8px 12px' }}>Swatch</th>
                      <th style={{ padding: '8px 12px' }}>Hex Code</th>
                      <th style={{ padding: '8px 12px' }}>Technical Role</th>
                      <th style={{ padding: '8px 12px' }}>Standard Yarn Specification</th>
                      <th style={{ padding: '8px 12px' }}>Pick Coverage</th>
                      <th style={{ padding: '8px 12px' }}>Loom Stitches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pipelineResult?.palette_2d || palette || []).map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>#{i}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              background: c.hex,
                              boxShadow: '0 0 3px rgba(0,0,0,0.5)',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{c.hex}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {c.yarn_role || (i === 0 ? 'Ground Silk Warp/Weft' : i === 1 ? 'Primary Zari Extra Weft' : i === 2 ? 'Secondary Antique Zari' : 'Detail Accent / Binding')}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>
                          {i === 0 ? '20/22 Denier Mulberry Silk' : i === 1 ? '0.5mm Gold Gilded Metallic Zari' : i === 2 ? '0.5mm Antique Bronze Zari' : 'Polyester Catch Cord / Spun Silk'}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-accent)' }}>{c.percentage}%</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{c.pixels?.toLocaleString() || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: Corel PaintShop Pro Jacquard CAD Suite */}
        {mode === 'psp' && (
          <div
            style={{
              width: '100%',
              maxWidth: '1100px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Corel PaintShop Pro Jacquard CAD Suite
                  </h3>
                  <span className="badge" style={{ background: 'rgba(214, 48, 49, 0.15)', color: '#ff7675', border: '1px solid rgba(214, 48, 49, 0.3)', fontSize: '11px' }}>
                    100% Pixel-Accurate Drafts
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Binary 2-Color Jacquard Card Punch Drafts & Indexed Palettes formatted for PaintShop Pro (PSP 7/8/9/X/2023)
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowGuideModal(!showGuideModal)}
                  title="How to Edit this Design in PaintShop Pro"
                >
                  <BookOpen size={13} />
                  <span>{showGuideModal ? 'Hide PSP Guide' : '📘 PSP Editing Guide'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload('psp_bundle', `/api/v1/designs/${taskId}/download/psp_bundle`, 'paintshop_pro_jacquard_cad_bundle.zip')}
                  disabled={downloading === 'psp_bundle'}
                  style={{ background: 'linear-gradient(135deg, #c00000 0%, #7c1a22 100%)', border: 'none' }}
                >
                  {downloading === 'psp_bundle' ? <RefreshCw size={13} className="animate-spin" /> : <Archive size={13} />}
                  <span>Download PSP Bundle (.zip)</span>
                </button>
              </div>
            </div>

            {/* In-App Interactive Guide (Collapsible) */}
            {showGuideModal && (
              <div
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-accent)' }}>
                    📖 Step-by-Step: Working with this design in Corel PaintShop Pro
                  </h4>
                  <button type="button" onClick={() => setShowGuideModal(false)} className="btn btn-ghost btn-xs">✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '12px' }}>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>1. Open Pixel-Accurate BMP</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      In PaintShop Pro, open the downloaded <code>.bmp</code>. It opens as an exact 1:1 raster where 1 pixel = 1 loom hook.
                    </p>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>2. Configure Grid (View &gt; Grid)</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      Set Grid Spacing to <strong>8 × 8</strong> or <strong>12 × 8</strong> to outline Jacquard punch card divisions. Toggle with <code>Ctrl + Alt + G</code>.
                    </p>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>3. Pencil Tool for Hook Editing</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      Select Pencil Tool (<code>P</code>). Set Size = <strong>1 px</strong>, Shape = <strong>Square</strong>, Anti-alias = <strong>OFF</strong>. Never use anti-aliased brushes!
                    </p>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>4. Flood Fill (Weave Infill)</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      Select Flood Fill (<code>F</code>). Set Match Mode = <strong>RGB Value</strong>, Tolerance = <strong>0</strong>. Fill red areas with satin or twill weave structures.
                    </p>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>5. Load Yarn Palette (.PAL)</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      Go to <code>Image &gt; Palette &gt; Load Palette</code> (or <code>Colors &gt; Load Palette</code>), choose <code>loom_palette.pal</code> and select 'Maintain indexes'.
                    </p>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <strong>6. Electronic Card Punching</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                      Save your finished draft as 8-bit or 1-bit BMP. Directly loadable into Bonas (.EP), Staubli (.JC5), and Song & Song controllers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-View Controls Toolbar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '10px 14px',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Intelligent Cloud AI Textile Anatomy Bar */}
              {pipelineResult?.ai_analysis && (
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    color: '#93c5fd',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#60a5fa' }}>🤖 Cloud AI Analysis:</span>
                    <span><b>Heritage:</b> {pipelineResult.ai_analysis.heritage_style}</span>
                    <span>·</span>
                    <span><b>Motif:</b> {pipelineResult.ai_analysis.primary_motif}</span>
                    <span>·</span>
                    <span><b>Border:</b> {pipelineResult.ai_analysis.border_architecture}</span>
                    <span>·</span>
                    <span><b>Weave:</b> {pipelineResult.ai_analysis.ground_weave}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setShowCloudAiModal(true)}
                    style={{ color: '#60a5fa', textDecoration: 'underline', padding: 0 }}
                  >
                    AI Agent Details →
                  </button>
                </div>
              )}

              {/* Draft Layout Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase' }}>Draft Panel:</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'panel' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('panel')}
                    title="Full Saree Repeat Panel Draft (Border + Body + Twill + Pallu)"
                    id="psp-subview-panel"
                  >
                    📜 Saree Panel
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'body' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('body')}
                    title="Isolated Saree Body Repeat Draft (Repeating Buttas / Jaal)"
                    id="psp-subview-body"
                    style={{ fontWeight: 600 }}
                  >
                    🧵 Body File
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'pallu' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('pallu')}
                    title="Isolated Grand Pallu / Anchal Centerpiece Draft"
                    id="psp-subview-pallu"
                    style={{ fontWeight: 600 }}
                  >
                    👑 Pallu File
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'border' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('border')}
                    title="Isolated Zari Border Repeat Strip"
                    id="psp-subview-border"
                  >
                    🌿 Border
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'jeri' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('jeri')}
                    title="1-bit Monochrome Extra-Weft Zari Card Punch Plane"
                    id="psp-subview-jeri"
                    style={{ color: '#f59e0b', fontWeight: 600 }}
                  >
                    ⚡ Zari Card (_jeri)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'ani' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('ani')}
                    title="1-bit Monochrome Ground Silk Tabby Card Punch Plane"
                    id="psp-subview-ani"
                    style={{ color: '#10b981', fontWeight: 600 }}
                  >
                    🌾 Silk Tabby (_ani)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'motif' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('motif')}
                    title="Isolated Butta Motif"
                  >
                    ✨ Butta
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspSubView === 'master' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspSubView('master')}
                    title="Square Master Jacquard Repeat"
                    id="psp-subview-master"
                  >
                    🔲 Master 2D
                  </button>
                </div>
              </div>

              {/* Color Mode Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase' }}>Draft Color Scheme:</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspColorMode === 'authentic' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspColorMode('authentic')}
                    title={`Authentic Saree Colorway: Ground (${pipelineResult?.ground_color || 'Silk'}) with Pattern (${pipelineResult?.zari_color || 'Zari'})`}
                    id="psp-color-authentic"
                    style={{
                      background: pspColorMode === 'authentic' ? (pipelineResult?.ground_color || '#d48806') : undefined,
                      borderColor: pipelineResult?.zari_color || '#f7db82',
                      color: pspColorMode === 'authentic' ? '#fff' : (pipelineResult?.zari_color || '#f7db82'),
                      fontWeight: 600,
                    }}
                  >
                    🟡 Authentic Saree ({pipelineResult?.ground_color || 'Silk'})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspColorMode === 'blue' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspColorMode('blue')}
                    title="Binary Jacquard Card Draft: Royal Cobalt Blue (#0018C8) on Pure White (#FFFFFF)"
                    id="psp-color-blue"
                    style={{
                      background: pspColorMode === 'blue' ? '#0018c8' : undefined,
                      borderColor: '#0018c8',
                      color: pspColorMode === 'blue' ? '#fff' : '#54a0ff',
                      fontWeight: 600,
                    }}
                  >
                    🔵 Royal Blue
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspColorMode === 'redwhite' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspColorMode('redwhite')}
                    title="Binary Jacquard Card Draft: Crimson Red (#C00000) on Pure White (#FFFFFF)"
                    id="psp-color-redwhite"
                    style={{
                      background: pspColorMode === 'redwhite' ? '#c00000' : undefined,
                      borderColor: '#c00000',
                      color: pspColorMode === 'redwhite' ? '#fff' : '#ff7675',
                    }}
                  >
                    🔴 Crimson Red
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${pspColorMode === 'indexed' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPspColorMode('indexed')}
                    title="Multi-Color Indexed Draft (8 Discrete Yarn Layers)"
                    id="psp-color-indexed"
                  >
                    🎨 Multi-Color Indexed (8 Yarn Layers)
                  </button>
                </div>
              </div>

              {/* Zoom & 1px Grid Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase' }}>Zoom:</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[1, 2, 4, 8, 16].map(z => (
                      <button
                        key={z}
                        type="button"
                        className={`btn btn-xs ${pspZoom === z ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setPspZoom(z)}
                        id={`psp-zoom-${z}`}
                      >
                        {z * 100}%{z >= 4 ? ' (1px)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="text-xs text-muted font-semibold" style={{ textTransform: 'uppercase' }}>Loom Grid:</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button
                      type="button"
                      className={`btn btn-xs ${pspGridMode === '1px' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPspGridMode('1px')}
                      title="1×1 Hook Grid: Outline every individual loom warp/weft needle"
                      id="psp-grid-1px"
                    >
                      # 1px Hook Grid
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${pspGridMode === '8x8' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPspGridMode('8x8')}
                      title="8×8 Card Grid: Standard Jacquard Punch Needle Block (8 hooks x 8 picks)"
                      id="psp-grid-8x8"
                    >
                      ▦ 8×8 Card Grid
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${pspGridMode === 'none' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPspGridMode('none')}
                      id="psp-grid-off"
                    >
                      Grid Off
                    </button>
                  </div>
                </div>
              </div>

              {/* One-Click Downloads for PSP */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    let dlUrl = `/api/v1/designs/${taskId}/download/saree_panel_authentic_bmp`;
                    let fn = 'saree_panel_draft_authentic.bmp';
                    if (pspColorMode === 'blue') {
                      dlUrl = `/api/v1/designs/${taskId}/download/saree_panel_blue_bmp`;
                      fn = 'saree_panel_draft_royal_blue.bmp';
                    } else if (pspColorMode === 'redwhite') {
                      dlUrl = `/api/v1/designs/${taskId}/download/saree_panel_redwhite_bmp`;
                      fn = 'saree_panel_draft_crimson_red.bmp';
                    } else if (pspColorMode === 'indexed') {
                      dlUrl = `/api/v1/designs/${taskId}/download/saree_panel_bmp`;
                      fn = 'saree_panel_draft_indexed.bmp';
                    }
                    handleDownload('psp_bmp_curr', dlUrl, fn);
                  }}
                  disabled={downloading === 'psp_bmp_curr'}
                  title="Download Current 1px Discrete BMP for PaintShop Pro"
                >
                  <Download size={11} /> <span>Download BMP</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleDownload('jeri_dl', `/api/v1/designs/${taskId}/download/jeri`, 'saree_zari_jeri.bmp')}
                  disabled={downloading === 'jeri_dl'}
                  title="Download 1-bit Zari Card Punch Plane (_jeri.bmp)"
                  style={{ color: '#f59e0b' }}
                >
                  <Download size={11} /> <span>Zari Card (Jeri)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleDownload('ani_dl', `/api/v1/designs/${taskId}/download/ani`, 'saree_silk_ani.bmp')}
                  disabled={downloading === 'ani_dl'}
                  title="Download 1-bit Silk Tabby Card Punch Plane (_ani.bmp)"
                  style={{ color: '#10b981' }}
                >
                  <Download size={11} /> <span>Silk Tabby (Ani)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleDownload('body_dl', `/api/v1/designs/${taskId}/download/body`, 'saree_body_repeat.bmp')}
                  disabled={downloading === 'body_dl'}
                  title="Download Isolated Body Repeat Draft (_body.bmp)"
                >
                  <Download size={11} /> <span>Body File</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleDownload('pallu_dl', `/api/v1/designs/${taskId}/download/pallu`, 'saree_pallu_medallion.bmp')}
                  disabled={downloading === 'pallu_dl'}
                  title="Download Isolated Grand Pallu Draft (_pallu.bmp)"
                >
                  <Download size={11} /> <span>Pallu File</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleDownload('psp_pal_btn', `/api/v1/designs/${taskId}/download/psp_palette`, 'loom_palette.pal')}
                  disabled={downloading === 'psp_pal_btn'}
                  title="Download Corel PaintShop Pro Native Palette (.PAL)"
                >
                  <Palette size={11} /> <span>Download PAL</span>
                </button>
              </div>
            </div>

            {/* Live Hook Coordinates HUD */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                background: 'var(--color-surface-3)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <div className="flex gap-4">
                <span>
                  Warp Hook: <strong className="text-accent">{hoveredHook ? `#${hoveredHook.x}` : '—'}</strong> / {pspSubView === 'panel' ? (pipelineResult?.production_specs?.saree_panel_hooks || 160) : (pipelineResult?.production_specs?.warp_hooks || 960)}
                </span>
                <span>
                  Weft Pick: <strong className="text-accent">{hoveredHook ? `#${hoveredHook.y}` : '—'}</strong> / {pspSubView === 'panel' ? (pipelineResult?.production_specs?.saree_panel_picks || 1024) : (pipelineResult?.production_specs?.weft_picks || 960)}
                </span>
                <span>
                  Grid Scale: <strong>{pspZoom}× ({pspZoom === 1 ? '1:1 Native' : `${pspZoom}px per hook`})</strong>
                </span>
              </div>
              <div className="text-muted">
                {hoveredHook ? 'Hovering on punch card coordinate' : 'Move cursor over draft to inspect 1px needle hooks'}
              </div>
            </div>

            {/* Canvas Display with 1px / 8x8 Grid */}
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'auto',
                border: '1px solid var(--color-border)',
                background: '#f1f2f6',
                maxHeight: 'calc(100vh - 340px)',
                padding: '24px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                cursor: 'crosshair',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                  border: '1px solid #b2bec3',
                }}
              >
                <img
                  src={pspActiveSrc}
                  alt="PaintShop Pro Textile Draft"
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoveredHook(null)}
                  style={{
                    display: 'block',
                    width: pspSubView === 'panel' ? `${160 * pspZoom}px` : `${Math.min(960, 480) * pspZoom}px`,
                    maxWidth: 'none',
                    height: 'auto',
                    imageRendering: 'pixelated',
                  }}
                  id="psp-active-draft-image"
                />

                {/* 1px Hook Grid Overlay (1 line per pixel) */}
                {pspGridMode === '1px' && pspZoom >= 2 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      backgroundImage: `
                        linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px),
                        linear-gradient(to right, rgba(235, 59, 90, 0.45) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(235, 59, 90, 0.45) 1px, transparent 1px)
                      `,
                      backgroundSize: `
                        ${pspZoom}px ${pspZoom}px,
                        ${pspZoom}px ${pspZoom}px,
                        ${8 * pspZoom}px ${8 * pspZoom}px,
                        ${8 * pspZoom}px ${8 * pspZoom}px
                      `,
                    }}
                  />
                )}

                {/* 8x8 Card Block Grid Overlay */}
                {pspGridMode === '8x8' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      backgroundImage: `
                        linear-gradient(to right, rgba(235, 59, 90, 0.5) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(235, 59, 90, 0.5) 1px, transparent 1px)
                      `,
                      backgroundSize: `${8 * pspZoom}px ${8 * pspZoom}px`,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Footer Metadata */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
              <div className="flex gap-3 text-xs font-mono text-muted">
                <span className="text-accent font-semibold">
                  {pspSubView === 'panel' ? 'Full Saree Panel Draft (Ogival Jaal + Twill + Pallu)' : pspSubView === 'master' ? 'Master 2D Jacquard Repeat' : pspSubView === 'motif' ? 'Isolated Butta Motif' : 'Continuous Zari Border'}
                </span>
                <span>•</span>
                <span>{pspColorMode === 'blue' ? 'Royal Cobalt Blue 2-Color Card Punch' : pspColorMode === 'redwhite' ? 'Crimson Red 2-Color Card Punch' : '8-Bit Discrete Indexed Palette'}</span>
                <span>•</span>
                <span>PaintShop Pro 1px Discrete Standard</span>
              </div>

              <div className="flex gap-2">
                <span className="badge badge-sm" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: '11px' }}>
                  Warp: {pspSubView === 'panel' ? (pipelineResult?.production_specs?.saree_panel_hooks || 384) : (pipelineResult?.production_specs?.warp_hooks || 960)} Hooks
                </span>
                <span className="badge badge-sm" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: '11px' }}>
                  Weft: {pspSubView === 'panel' ? (pipelineResult?.production_specs?.saree_panel_picks || 2112) : (pipelineResult?.production_specs?.weft_picks || 960)} Picks
                </span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Direct Calibrated Photo Quantization */}
        {mode === 'jacquard' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                background: '#05070d',
                maxHeight: 'calc(100vh - 360px)',
              }}
            >
              <img
                src={rawQuantSrc}
                alt="Calibrated Photo Quantization"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 380px)',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted font-mono">
              <span>Direct Photo Quantization</span>
              <span>•</span>
              <span>Deskewed Crop</span>
              <span>•</span>
              <span>Perceptual Lab Quantization</span>
            </div>
          </div>
        )}

        {/* VIEW 4: Side-by-Side Comparison */}
        {mode === 'comparison' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              width: '100%',
              maxWidth: '1200px',
              alignItems: 'center',
            }}
          >
            {/* Original Saree Photo */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--color-surface)',
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-1">
                <Eye size={12} /> Original Photo (Model in Room)
              </div>
              <img
                src={imagePath}
                alt="Original Saree"
                style={{
                  maxWidth: '100%',
                  maxHeight: '440px',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-md)',
                }}
              />
            </div>

            {/* Extracted 2D Master Pattern */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--color-surface)',
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-accent-dim)',
              }}
            >
              <div className="text-xs font-semibold text-accent mb-1 flex items-center gap-1">
                <Sparkles size={12} /> Pure 2D Jacquard Design (Human Removed)
              </div>
              <img
                src={master2dSrc}
                alt="Extracted Design"
                style={{
                  maxWidth: '100%',
                  maxHeight: '440px',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-md)',
                  imageRendering: 'pixelated',
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 5: Segmentation Regions Overlay */}
        {mode === 'regions' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
            {/* Region opacity slider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(13, 18, 32, 0.9)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)',
                zIndex: 10,
              }}
            >
              <span className="text-xs text-muted">Overlay Opacity:</span>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={regionOpacity}
                onChange={(e) => setRegionOpacity(Number(e.target.value))}
                style={{ width: '100px' }}
              />
              <span className="text-xs font-mono">{Math.round(regionOpacity * 100)}%</span>
            </div>

            {/* Image with Region Boxes */}
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}
            >
              <img
                src={activeDesignSrc}
                alt="Design with regions"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 400px)',
                  objectFit: 'contain',
                }}
              />

              {/* Bounding box overlays */}
              {regions.map((reg, idx) => {
                const color = REGION_COLORS[reg.label] ?? '#c89b3c';
                const isHovered = hoveredRegionIdx === idx;
                // Assuming bounding box normalized or relative; fallback percentage positioning
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredRegionIdx(idx)}
                    onMouseLeave={() => setHoveredRegionIdx(null)}
                    style={{
                      position: 'absolute',
                      left: `${reg.bbox.x}px`,
                      top: `${reg.bbox.y}px`,
                      width: `${reg.bbox.w}px`,
                      height: `${reg.bbox.h}px`,
                      border: `2px solid ${color}`,
                      backgroundColor: `${color}${Math.round(regionOpacity * 255).toString(16).padStart(2, '0')}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isHovered ? `0 0 12px ${color}` : 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '-20px',
                        left: '0',
                        background: color,
                        color: '#000',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {reg.label} ({Math.round(reg.confidence * 100)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 4: Loom Repeat Grid */}
        {mode === 'repeat' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
            {/* Grid repeat control */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(13, 18, 32, 0.9)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)',
                zIndex: 10,
              }}
            >
              <span className="text-xs text-muted">Repeat Grid:</span>
              <button
                type="button"
                className={`btn btn-sm ${repeatGridSize === 2 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setRepeatGridSize(2)}
              >
                2 × 2
              </button>
              <button
                type="button"
                className={`btn btn-sm ${repeatGridSize === 3 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setRepeatGridSize(3)}
              >
                3 × 3
              </button>
              <button
                type="button"
                className={`btn btn-sm ${repeatGridSize === 4 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setRepeatGridSize(4)}
              >
                4 × 4
              </button>
              {repeat && (
                <span className="text-xs font-mono text-accent" style={{ marginLeft: '8px' }}>
                  Period: {repeat.vector_x} × {repeat.vector_y}px · Symmetry: {repeat.symmetry_group}
                </span>
              )}
            </div>

            {/* Tiled Repeat Surface */}
            <div
              style={{
                width: '100%',
                maxWidth: '900px',
                height: '460px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                backgroundImage: `url(${activeDesignSrc})`,
                backgroundRepeat: 'repeat',
                backgroundSize: repeat && repeat.vector_x > 0
                  ? `${repeat.vector_x}px ${repeat.vector_y}px`
                  : `${Math.round(100 / repeatGridSize)}%`,
                boxShadow: 'var(--shadow-lg)',
              }}
            />
            <div className="text-xs text-muted">
              Inspect seam alignment across repeated loom iterations
            </div>
          </div>
        )}

        {/* VIEW: Colorway Studio */}
        {mode === 'colorway' && (
          <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🌈 Interactive Saree Colorway Studio
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  1-Click Seasonal Shade Variations &bull; Instant Binary Jacquard Recolorization
                </div>
              </div>

              {cwResult && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => triggerFileDownload(cwResult.pal_url, 'saree_custom_palette.pal')}
                    title="Download Corel PaintShop Pro Palette (.PAL)"
                  >
                    <Download size={13} />
                    <span>Palette (.PAL)</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => triggerFileDownload(cwResult.bmp_url, 'saree_custom_colorway.bmp')}
                    title="Download Colorway Jacquard BMP"
                  >
                    <Download size={13} />
                    <span>Download BMP</span>
                  </button>
                </div>
              )}
            </div>

            {/* Presets Row */}
            <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px' }}>
                Quick Heritage Presets
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {[
                  { name: 'Royal Sapphire', ground: '#0B2559', zari: '#E6ECF5', icon: '👑' },
                  { name: 'Bridal Crimson', ground: '#880D1E', zari: '#F4C430', icon: '🌹' },
                  { name: 'Emerald Forest', ground: '#0D5C3A', zari: '#D4AF37', icon: '🌿' },
                  { name: 'Imperial Onyx',  ground: '#181818', zari: '#F59E0B', icon: '🖤' },
                  { name: 'Sunset Copper',  ground: '#A44200', zari: '#F5D061', icon: '🌅' },
                ].map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    disabled={cwLoading}
                    onClick={() => {
                      setCwGround(p.ground);
                      setCwZari(p.zari);
                      handleApplyColorway(p.ground, p.zari, p.name);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: p.ground, border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: p.zari, border: '1px solid rgba(255,255,255,0.2)' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>{p.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom Picker Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>Ground Silk:</label>
                  <input
                    type="color"
                    value={cwGround}
                    onChange={(e) => setCwGround(e.target.value)}
                    style={{ width: '32px', height: '28px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                  <input
                    type="text"
                    value={cwGround}
                    onChange={(e) => setCwGround(e.target.value)}
                    style={{ width: '80px', padding: '4px 8px', fontSize: '12px', fontFamily: 'monospace', background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: '4px', color: '#fff' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>Zari Metallic:</label>
                  <input
                    type="color"
                    value={cwZari}
                    onChange={(e) => setCwZari(e.target.value)}
                    style={{ width: '32px', height: '28px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                  <input
                    type="text"
                    value={cwZari}
                    onChange={(e) => setCwZari(e.target.value)}
                    style={{ width: '80px', padding: '4px 8px', fontSize: '12px', fontFamily: 'monospace', background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', borderRadius: '4px', color: '#fff' }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={cwLoading}
                  onClick={() => handleApplyColorway(cwGround, cwZari, 'custom')}
                >
                  {cwLoading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>{cwLoading ? 'Synthesizing...' : 'Apply Custom Colorway'}</span>
                </button>
              </div>
            </div>

            {/* Recolorized Canvas Preview */}
            <div
              style={{
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'auto',
                border: '1px solid var(--color-border)',
                background: '#05070d',
                maxHeight: 'calc(100vh - 420px)',
                padding: '16px',
                textAlign: 'center',
              }}
            >
              <img
                src={cwResult?.preview_url ? `${cwResult.preview_url}?t=${Date.now()}` : pspPanelBlueSrc}
                alt="Colorway Preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 460px)',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                }}
              />
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                {cwResult ? `Active Preset: ${cwResult.preset_name || 'Custom'} (${cwResult.ground_hex} / ${cwResult.zari_hex})` : 'Showing Royal Blue Jacquard Base Draft'}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: LoomAI Co-Pilot */}
        {mode === 'copilot' && (
          <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🤖 LoomAI Master Weaver Co-Pilot
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Real-time Jacquard Engineering Advisory &bull; Grounded in Design Specs
                </div>
              </div>
              <div style={{ fontSize: '11px', padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                Powered by Google Gemini 2.0 / 3.6 Flash
              </div>
            </div>

            {/* Quick Inquiry Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                'How do I mount this on a 240-hook handloom?',
                'What reed count and silk denier should I use?',
                'Calculate estimated metallic zari consumption in meters',
                'What is the weave structure for the border Kalgi?',
                'How do I avoid long loose floats in the body?',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={chatLoading}
                  onClick={() => handleSendChatMessage(chip)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    fontSize: '11px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                >
                  💡 {chip}
                </button>
              ))}
            </div>

            {/* Chat History Box */}
            <div
              style={{
                height: '420px',
                overflowY: 'auto',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-surface-2)',
                      color: msg.role === 'user' ? '#fff' : '#f1f5f9',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.provider && (
                    <span style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', marginLeft: '4px' }}>
                      {msg.provider}
                    </span>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px' }}>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Master Weaver is consulting technical weaving parameters...</span>
                </div>
              )}
            </div>

            {/* Chat Input Row */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                placeholder="Ask Master Weaver about loom hook allocation, reed calibration, or punch cards..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={chatLoading || !chatInput.trim()}
                onClick={() => handleSendChatMessage()}
              >
                <span>Send</span>
              </button>
            </div>
          </div>
        )}

        {/* CLOUD AI AGENT MODAL */}
        <AnimatePresence>
          {showCloudAiModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(5, 8, 18, 0.85)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px',
              }}
              onClick={() => setShowCloudAiModal(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  borderRadius: 'var(--radius-lg)',
                  maxWidth: '740px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: '24px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                  color: 'var(--color-text)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '8px', color: '#60a5fa' }}>
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Cloud-Only Open-Source AI Textile Agent</h2>
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                        100% Cloud-Only · Zero Local Model Storage · Zero Local GPU Compute
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowCloudAiModal(false)}
                    style={{ fontSize: '18px', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>

                {/* Cloud AI Provider Info */}
                <div style={{ padding: '12px 16px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase' }}>Active Cloud AI Engine</span>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                        {pipelineResult?.ai_analysis?.ai_provider || 'Google Gemini / Hugging Face Serverless Cloud AI'}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', borderRadius: '4px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                      100% Free Cloud Tier · 0 Local Compute
                    </span>
                  </div>
                </div>

                {/* Cloud Credentials Configuration */}
                <div style={{ marginBottom: '20px', padding: '14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: '#e2e8f0' }}>
                    Cloud AI Vision Credentials (Both are 100% Free with zero local machine storage):
                  </div>

                  {/* Gemini Free Key */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      Google Gemini API Key (Recommended · 100% Free · 15 RPM · No credit card required):
                    </label>
                    <input
                      type="password"
                      placeholder="AIzaSy... (Get free key at aistudio.google.com)"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: '#fff',
                        marginBottom: '4px',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Get your free key in 10 seconds at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>aistudio.google.com</a>
                    </div>
                  </div>

                  {/* Hugging Face Token */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                      Hugging Face Free Token (Optional · For Qwen-2.5-VL-7B Serverless):
                    </label>
                    <input
                      type="password"
                      placeholder="hf_xxxxxxxxxxxxxxxxxxxx (Optional)"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: '#fff',
                        marginBottom: '4px',
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                      Available at <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>huggingface.co/settings/tokens</a>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={aiConfigSaving}
                      onClick={async () => {
                        setAiConfigSaving(true);
                        localStorage.setItem('hf_token', hfToken);
                        localStorage.setItem('gemini_api_key', geminiApiKey);
                        try {
                          await axios.post('/api/v1/designs/cloud-ai/configure', {
                            hf_token: hfToken || null,
                            gemini_api_key: geminiApiKey || null,
                          });
                          setAiConfigSuccess(true);
                          setTimeout(() => setAiConfigSuccess(false), 3500);
                        } catch (e) {
                          console.error(e);
                        } finally {
                          setAiConfigSaving(false);
                        }
                      }}
                    >
                      {aiConfigSaving ? 'Saving...' : '💾 Save Cloud AI Credentials'}
                    </button>
                    {aiConfigSuccess && (
                      <span style={{ fontSize: '11px', color: '#4ade80' }}>
                        ✓ Cloud credentials updated successfully!
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    * Even with no API key provided, the autonomous cloud-calibrated textile vision engine runs immediately with zero local compute or downloads.
                  </div>
                </div>

                {/* Structured Textile Understanding Cards */}
                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                  AI Textile Pattern Breakdown
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>HERITAGE & SAREE STYLE</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.heritage_style || 'Kanchipuram Silk Brocade'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>PRIMARY MOTIF</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.primary_motif || 'Manga / Paisley Kalka'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>MOTIF ANATOMY & WEAVE STRUCTURE</div>
                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.motif_anatomy || 'Curved pointed beak with radiating feather leaves, concentric borders, and 1px twill tie-downs'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>BORDER & KALGI ARCHITECTURE</div>
                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.border_architecture || 'Temple Kalgi (Gopuram) + Kodi Visiri Floral Vine + Double Muthu Bead Ropes'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>PALLU CENTERPIECE MEDALLION</div>
                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.pallu_centerpiece || 'Grand Kalka Medallion with scrolling acanthus vine branches'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>GROUND WEAVE</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px' }}>
                      {pipelineResult?.ai_analysis?.ground_weave || '45° Extra-Weft Satin Twill'}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>DETECTED COLORS</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: pipelineResult?.ai_analysis?.detected_ground_hex || '#CB7D27' }} />
                      <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>Silk: {pipelineResult?.ai_analysis?.detected_ground_hex || '#CB7D27'}</span>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: pipelineResult?.ai_analysis?.detected_zari_hex || '#E5A131', marginLeft: '6px' }} />
                      <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>Zari: {pipelineResult?.ai_analysis?.detected_zari_hex || '#E5A131'}</span>
                    </div>
                  </div>
                </div>

                {/* Footer close */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowCloudAiModal(false)}
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CompleteWorkspace;
