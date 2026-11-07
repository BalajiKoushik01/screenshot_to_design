/**
 * Shared TypeScript types for the WeaveCore WPEE v3 frontend.
 * These mirror the backend Pydantic/dataclass shapes returned by the API.
 */

// ── Region Segmentation ──────────────────────────────────────────────────

export type RegionLabel = 'border' | 'body' | 'pallu' | 'motif';

export interface RegionBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionData {
  label:      RegionLabel;
  bbox:       RegionBBox;
  confidence: number;
  area_px:    number;
  metadata:   Record<string, unknown>;
}

// ── Repeat / Lattice Detection ───────────────────────────────────────────

export interface RepeatData {
  vector_x:       number;
  vector_y:       number;
  confidence:     number;
  symmetry_group: string;
  freq_x:         number;
  freq_y:         number;
}

export interface PaletteColor {
  index?:     number;
  hex:        string;
  rgb:        [number, number, number];
  percentage: number;
  pixels:     number;
  yarn_role?: string;
}

export interface ProductionSpecs {
  loom_type:              string;
  warp_hooks:             number;
  weft_picks:             number;
  ends_per_inch:          number;
  picks_per_inch:         number;
  physical_width_inches:  number;
  physical_height_inches: number;
  color_indexing:         string;
  repeat_structure:       string;
  saree_panel_hooks?:     number;
  saree_panel_picks?:     number;
}

export interface AiAnalysisData {
  heritage_style?:      string;
  primary_motif?:       string;
  motif_anatomy?:       string;
  border_architecture?: string;
  pallu_centerpiece?:   string;
  ground_weave?:        string;
  detected_ground_hex?: string;
  detected_zari_hex?:   string;
  ai_provider?:         string;
  is_live_cloud?:       boolean;
  raw_ai_response?:     string;
}

export interface PipelineResult {
  file_url:               string;
  tiff_url:               string;
  manifest_url:           string;
  preview_url?:           string;
  raw_quant_bmp_url?:     string;
  raw_quant_preview_url?: string;
  master_2d_bmp_url?:              string;
  master_2d_tiff_url?:             string;
  master_2d_preview_url?:          string;
  master_2d_redwhite_preview_url?: string;
  master_2d_redwhite_bmp_url?:     string;
  master_2d_blue_preview_url?:     string;
  master_2d_blue_bmp_url?:         string;
  saree_panel_preview_url?:          string;
  saree_panel_bmp_url?:              string;
  saree_panel_redwhite_preview_url?: string;
  saree_panel_authentic_preview_url?: string;
  saree_panel_authentic_bmp_url?:     string;
  saree_panel_blue_preview_url?:     string;
  saree_panel_blue_bmp_url?:         string;
  motif_bmp_url?:                  string;
  motif_preview_url?:              string;
  border_bmp_url?:                 string;
  border_preview_url?:             string;
  border_jeri_bmp_url?:            string;
  body_preview_url?:               string;
  body_bmp_url?:                   string;
  body_jeri_bmp_url?:              string;
  body_ani_bmp_url?:               string;
  pallu_preview_url?:              string;
  pallu_bmp_url?:                  string;
  pallu_jeri_bmp_url?:             string;
  pallu_ani_bmp_url?:              string;
  photo_trace_url?:                string;
  photo_reference_url?:            string;
  jeri_preview_url?:               string;
  dot_bmp_url?:                    string;
  jeri_bmp_url?:                   string;
  ani_preview_url?:                string;
  ani_bmp_url?:                    string;
  jasc_pal_url?:                   string;
  psp_bundle_zip_url?:             string;
  wif_url?:                        string;
  dat_url?:                        string;
  svg_url?:                        string;
  techpack_url?:                   string;
  ground_color?:                   string;
  zari_color?:                     string;
  palette?:                        PaletteColor[];
  palette_2d?:                     PaletteColor[];
  production_specs?:               ProductionSpecs;
  psp_specs?:                      Record<string, any>;
  ai_analysis?:                    AiAnalysisData;
  regions:                         RegionData[];
  repeat:                          RepeatData;
  sharpness:                       number;
  restoration_applied:             boolean;
  pipeline_log:                    string[];
}

// ── Live Status (polled while STARTED) ──────────────────────────────────

export interface TaskProgress {
  status:   'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE';
  stage?:   string;
  progress?: number;
  log?:     string[];
  result?:  PipelineResult;
  error?:   string;
}

// ── Colour ───────────────────────────────────────────────────────────────

export const REGION_COLORS: Record<RegionLabel, string> = {
  border: '#c89b3c',
  body:   '#7c6fee',
  pallu:  '#3ecf8e',
  motif:  '#ff9f42',
};
