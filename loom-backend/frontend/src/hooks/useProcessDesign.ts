
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useLoomStore, LoomStep } from '../store/useLoomStore';
import type { PipelineResult, TaskProgress } from '../types';

export interface ProcessDesignParams {
  imageFile:   File;
  maskFile?:   File | null;
  colors:      number;
  targetWidth: number;
  coordinates: [number, number][];
}

/**
 * Hook managing the full client-server lifecycle for a WPEE v3 design run.
 *
 * Lifecycle:
 *   1. POST /api/v1/designs/upload → receive task_id
 *   2. Poll GET /api/v1/designs/status/{task_id} every 1.5 s
 *   3. While STARTED  → update pipelineStage + pipelineProgress + pipelineLog
 *   4. On SUCCESS     → populate all extended result fields, advance to COMPLETE
 *   5. On FAILURE     → set error, advance to COMPLETE
 */
export const useProcessDesign = () => {
  const {
    setTaskId,
    setStep,
    setDownloadUrl,
    setPipelineStage,
    setPipelineProgress,
    setPipelineLog,
    setRegions,
    setRepeat,
    setTiffUrl,
    setManifestUrl,
    setSharpness,
    setRestorationApplied,
    setPipelineResult,
    setPreviewUrl,
    setPalette,
  } = useLoomStore((s) => ({
    setTaskId:              s.setTaskId,
    setStep:                s.setStep,
    setDownloadUrl:         s.setDownloadUrl,
    setPipelineStage:       s.setPipelineStage,
    setPipelineProgress:    s.setPipelineProgress,
    setPipelineLog:         s.setPipelineLog,
    setRegions:             s.setRegions,
    setRepeat:              s.setRepeat,
    setTiffUrl:             s.setTiffUrl,
    setManifestUrl:         s.setManifestUrl,
    setSharpness:           s.setSharpness,
    setRestorationApplied:  s.setRestorationApplied,
    setPipelineResult:      s.setPipelineResult,
    setPreviewUrl:          s.setPreviewUrl,
    setPalette:             s.setPalette,
  }));

  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const _applyResult = (result: PipelineResult) => {
    setDownloadUrl(result.file_url ?? '');
    setTiffUrl(result.tiff_url ?? '');
    setManifestUrl(result.manifest_url ?? '');
    setPreviewUrl(result.preview_url ?? result.file_url ?? '');
    setPalette(result.palette ?? []);
    setRegions(result.regions ?? []);
    setRepeat(result.repeat ?? null);
    setSharpness(result.sharpness ?? null);
    setRestorationApplied(result.restoration_applied ?? false);
    setPipelineLog(result.pipeline_log ?? []);
    setPipelineProgress(100);
    setPipelineStage('Pipeline complete');
    setPipelineResult(result);
    setStep(LoomStep.COMPLETE);
  };

  const startProcessing = async (params: ProcessDesignParams) => {
    const { imageFile, maskFile, colors, targetWidth, coordinates } = params;
    setError(null);

    try {
      // ── Build multipart form ──────────────────────────────
      const form = new FormData();
      form.append('image', imageFile);
      if (maskFile) form.append('mask', maskFile);
      form.append('coordinates', JSON.stringify(coordinates));
      form.append('color_count',  String(colors));
      form.append('target_width', String(targetWidth));

      // ── Upload ───────────────────────────────────────────
      const uploadResp = await axios.post('/api/v1/designs/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { task_id } = uploadResp.data as { task_id: string };
      setTaskId(task_id);
      setStep(LoomStep.PROCESSING);
      setPipelineStage('Queued');
      setPipelineProgress(0);

      // ── Polling loop ─────────────────────────────────────
      const poll = async () => {
        try {
          const resp = await axios.get<TaskProgress>(`/api/v1/designs/status/${task_id}`);
          const data = resp.data;

          if (data.status === 'SUCCESS' && data.result) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            _applyResult(data.result);
            return;
          }

          if (data.status === 'FAILURE') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setError(data.error ?? 'Processing failed on the server');
            setStep(LoomStep.COMPLETE);
            return;
          }

          if (data.status === 'STARTED') {
            setPipelineStage(data.stage ?? 'Processing…');
            setPipelineProgress(data.progress ?? 0);
            setPipelineLog(data.log ?? []);
          }
          // PENDING → keep polling
        } catch {
          setError('Error while polling task status');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      };

      pollingRef.current = setInterval(poll, 1500);
    } catch {
      setError('Failed to upload design to the server');
    }
  };

  const loadTaskById = async (id: string) => {
    try {
      const resp = await axios.get<TaskProgress>(`/api/v1/designs/status/${id}`);
      const data = resp.data;
      if (data.status === 'SUCCESS' && data.result) {
        setTaskId(id);
        _applyResult(data.result);
        return true;
      }
    } catch (e) {
      console.error('Failed to load task by ID', e);
    }
    return false;
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return { startProcessing, loadTaskById, error };
};
