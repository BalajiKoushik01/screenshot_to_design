import { create } from 'zustand';
import type { RegionData, RepeatData, PipelineResult, PaletteColor } from '../types';

/**
 * Interaction steps for the Loom workspace.
 */
export enum LoomStep {
  UPLOADED    = 'UPLOADED',
  CALIBRATING = 'CALIBRATING',
  MASKING     = 'MASKING',
  PROCESSING  = 'PROCESSING',
  COMPLETE    = 'COMPLETE',
}

export type Coordinate = [number, number];

export interface LoomState {
  // ── Core workflow ──────────────────────────────────────────────────────
  step:        LoomStep;
  imagePath:   string;
  coordinates: Coordinate[];
  brushSize:   number;
  taskId:      string;
  downloadUrl: string;

  // ── Live pipeline progress ─────────────────────────────────────────────
  pipelineStage:    string;
  pipelineProgress: number;
  pipelineLog:      string[];

  // ── Extended results (populated on SUCCESS) ────────────────────────────
  regions:             RegionData[];
  repeat:              RepeatData | null;
  tiffUrl:             string;
  manifestUrl:         string;
  previewUrl:          string;
  palette:             PaletteColor[];
  sharpness:           number | null;
  restorationApplied:  boolean;
  pipelineResult:      PipelineResult | null;

  // ── Mutators ───────────────────────────────────────────────────────────
  setStep:              (step: LoomStep) => void;
  setImagePath:         (path: string) => void;
  setCoordinates:       (coords: Coordinate[]) => void;
  setBrushSize:         (size: number) => void;
  setTaskId:            (id: string) => void;
  setDownloadUrl:       (url: string) => void;
  setPreviewUrl:        (url: string) => void;
  setPalette:           (palette: PaletteColor[]) => void;

  setPipelineStage:     (stage: string) => void;
  setPipelineProgress:  (pct: number) => void;
  setPipelineLog:       (log: string[]) => void;

  setRegions:           (regions: RegionData[]) => void;
  setRepeat:            (repeat: RepeatData | null) => void;
  setTiffUrl:           (url: string) => void;
  setManifestUrl:       (url: string) => void;
  setSharpness:         (v: number | null) => void;
  setRestorationApplied:(v: boolean) => void;
  setPipelineResult:    (r: PipelineResult | null) => void;

  reset: () => void;
}

const initialState: Omit<LoomState,
  | 'setStep' | 'setImagePath' | 'setCoordinates' | 'setBrushSize'
  | 'setTaskId' | 'setDownloadUrl' | 'setPreviewUrl' | 'setPalette'
  | 'setPipelineStage' | 'setPipelineProgress'
  | 'setPipelineLog' | 'setRegions' | 'setRepeat' | 'setTiffUrl'
  | 'setManifestUrl' | 'setSharpness' | 'setRestorationApplied'
  | 'setPipelineResult' | 'reset'
> = {
  step:                LoomStep.UPLOADED,
  imagePath:           '',
  coordinates:         [],
  brushSize:           5,
  taskId:              '',
  downloadUrl:         '',
  previewUrl:          '',
  palette:             [],
  pipelineStage:       '',
  pipelineProgress:    0,
  pipelineLog:         [],
  regions:             [],
  repeat:              null,
  tiffUrl:             '',
  manifestUrl:         '',
  sharpness:           null,
  restorationApplied:  false,
  pipelineResult:      null,
};

export const useLoomStore = create<LoomState>((set) => ({
  ...initialState,

  setStep:               (step)    => set({ step }),
  setImagePath:          (path)    => set({ imagePath: path }),
  setCoordinates:        (coords)  => set({ coordinates: coords }),
  setBrushSize:          (size)    => set({ brushSize: size }),
  setTaskId:             (id)      => set({ taskId: id }),
  setDownloadUrl:        (url)     => set({ downloadUrl: url }),
  setPreviewUrl:         (url)     => set({ previewUrl: url }),
  setPalette:            (palette) => set({ palette }),

  setPipelineStage:      (stage)   => set({ pipelineStage: stage }),
  setPipelineProgress:   (pct)     => set({ pipelineProgress: pct }),
  setPipelineLog:        (log)     => set({ pipelineLog: log }),

  setRegions:            (regions) => set({ regions }),
  setRepeat:             (repeat)  => set({ repeat }),
  setTiffUrl:            (url)     => set({ tiffUrl: url }),
  setManifestUrl:        (url)     => set({ manifestUrl: url }),
  setSharpness:          (v)       => set({ sharpness: v }),
  setRestorationApplied: (v)       => set({ restorationApplied: v }),
  setPipelineResult:     (r)       => set({ pipelineResult: r }),

  reset: () => set({ ...initialState }),
}));
