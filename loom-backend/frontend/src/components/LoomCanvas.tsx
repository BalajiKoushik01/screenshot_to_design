import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { fabric } from 'fabric';
import { useLoomStore, LoomStep } from '../store/useLoomStore';
import { RotateCcw, Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export interface LoomCanvasRef {
  getMaskBlob: () => Promise<Blob | null>;
  resetCalibration: () => void;
  applyPreset: (type: 'full' | 'center' | 'border' | 'motif') => void;
  clearMask: () => void;
}

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];

const LoomCanvas = forwardRef<LoomCanvasRef>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  const polygonRef = useRef<fabric.Polygon | null>(null);
  const imageDimsRef = useRef<{ width: number; height: number }>({ width: 800, height: 600 });
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFit, setIsFit] = useState<boolean>(true);

  // Store
  const {
    step,
    imagePath,
    coordinates,
    brushSize,
    setCoordinates,
  } = useLoomStore((state) => ({
    step: state.step,
    imagePath: state.imagePath,
    coordinates: state.coordinates,
    brushSize: state.brushSize,
    setCoordinates: state.setCoordinates,
  }));

  // Update guide polygon points
  const updateGuidePolygon = useCallback((coords: [number, number][]) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    if (polygonRef.current) {
      canvas.remove(polygonRef.current);
      polygonRef.current = null;
    }

    if (coords.length === 4) {
      const polyPoints = coords.map(([x, y]) => ({ x, y }));
      const poly = new fabric.Polygon(polyPoints, {
        fill: 'rgba(200, 155, 60, 0.12)',
        stroke: '#c89b3c',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      polygonRef.current = poly;
      canvas.add(poly);
      canvas.sendToBack(poly);
      // Ensure background image is behind the polygon
      const bg = canvas.backgroundImage;
      if (bg && (bg as any).sendToBack) {
        (bg as any).sendToBack();
      }
    }
  }, []);

  // Create or refresh calibration markers
  const createCalibrationMarkers = useCallback((overrideCoords?: [number, number][]) => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // Clean old markers
    canvas.getObjects().forEach((obj) => {
      const name = (obj as any).name || '';
      if (name.startsWith('marker-') || name.startsWith('label-') || obj === polygonRef.current) {
        canvas.remove(obj);
      }
    });

    const { width: w, height: h } = imageDimsRef.current;
    const currentCoords = overrideCoords || (coordinates.length === 4 ? coordinates : [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ]);

    // Ensure store is synced immediately with the 4 initial points
    if (!overrideCoords && coordinates.length !== 4) {
      setCoordinates(currentCoords as [number, number][]);
    }

    // Add guide polygon
    updateGuidePolygon(currentCoords as [number, number][]);

    // Create 4 corner circle markers
    currentCoords.forEach(([x, y], idx) => {
      const marker = new fabric.Circle({
        left: x,
        top: y,
        radius: 12,
        fill: '#ffffff',
        stroke: '#c89b3c',
        strokeWidth: 3,
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: true,
        hoverCursor: 'crosshair',
        name: `marker-${idx}`,
      });
      (marker as any).markerIdx = idx;

      marker.on('moving', () => {
        const activeIdx = (marker as any).markerIdx;
        const newX = Math.round(marker.left ?? 0);
        const newY = Math.round(marker.top ?? 0);

        // Fetch all 4 markers
        const updatedCoords: [number, number][] = [...currentCoords as [number, number][]];
        updatedCoords[activeIdx] = [newX, newY];

        canvas.getObjects().forEach((obj) => {
          if ((obj as any).markerIdx !== undefined) {
            const i = (obj as any).markerIdx;
            updatedCoords[i] = [Math.round(obj.left ?? 0), Math.round(obj.top ?? 0)];
          }
        });

        setCoordinates(updatedCoords);
        updateGuidePolygon(updatedCoords);
      });

      canvas.add(marker);
      canvas.bringToFront(marker);
    });

    canvas.requestRenderAll();
  }, [coordinates, setCoordinates, updateGuidePolygon]);

  // Adjust zoom/dimensions to fit container
  const applyFitOrZoom = useCallback((fit: boolean, zoom: number) => {
    const canvas = fabricCanvas.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const imgW = imageDimsRef.current.width;
    const imgH = imageDimsRef.current.height;
    if (!imgW || !imgH) return;

    let targetZoom = zoom;
    if (fit) {
      const availableW = container.clientWidth - 40;
      const availableH = Math.max(container.clientHeight - 40, 480);
      const scaleW = availableW / imgW;
      const scaleH = availableH / imgH;
      targetZoom = Math.min(scaleW, scaleH, 1.0);
      targetZoom = Math.max(targetZoom, 0.1);
    }

    setZoomLevel(targetZoom);
    canvas.setDimensions({
      width: Math.round(imgW * targetZoom),
      height: Math.round(imgH * targetZoom),
    });
    canvas.setZoom(targetZoom);
    canvas.requestRenderAll();
  }, []);

  // Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      preserveObjectStacking: true,
      selection: false,
    });
    fabricCanvas.current = canvas;

    const handleResize = () => {
      if (isFit) {
        applyFitOrZoom(true, 1);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, [applyFitOrZoom, isFit]);

  // Load Image when imagePath changes
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas || !imagePath) return;

    fabric.Image.fromURL(
      imagePath,
      (img) => {
        if (!img || !img.width || !img.height) return;
        imageDimsRef.current = { width: img.width, height: img.height };

        canvas.setBackgroundImage(img, () => {
          applyFitOrZoom(isFit, zoomLevel);

          if (step === LoomStep.CALIBRATING) {
            const w = img.width!;
            const h = img.height!;
            const init = [
              [0, 0],
              [w, 0],
              [w, h],
              [0, h],
            ] as [number, number][];
            createCalibrationMarkers(init);
            setCoordinates(init);
          }
        });
      },
      { crossOrigin: 'anonymous' }
    );
  }, [imagePath, step, applyFitOrZoom, createCalibrationMarkers, isFit, zoomLevel, setCoordinates]);

  // Handle step mode transitions
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // Remove old markers if moving away from calibration
    if (step !== LoomStep.CALIBRATING) {
      canvas.getObjects().forEach((obj) => {
        const name = (obj as any).name || '';
        if (name.startsWith('marker-') || name.startsWith('label-') || obj === polygonRef.current) {
          canvas.remove(obj);
        }
      });
      polygonRef.current = null;
    }

    if (step === LoomStep.CALIBRATING) {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      createCalibrationMarkers();
    } else if (step === LoomStep.MASKING) {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = brushSize;
      canvas.freeDrawingBrush.color = 'rgba(239, 68, 68, 0.65)'; // Vivid semi-transparent red
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.forEachObject((o) => {
        o.selectable = false;
        o.evented = false;
      });
    }

    canvas.requestRenderAll();
  }, [step, brushSize, createCalibrationMarkers]);

  // Imperative handle for parent
  useImperativeHandle(ref, () => ({
    getMaskBlob: async (): Promise<Blob | null> => {
      const canvas = fabricCanvas.current;
      if (!canvas) return null;

      const pathObjects = canvas.getObjects().filter((o) => o.type === 'path');
      if (pathObjects.length === 0) {
        return null; // No mask painted
      }

      const { width: w, height: h } = imageDimsRef.current;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return null;

      // Fill black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Render paths using temporary static fabric canvas
      const tempStatic = new fabric.StaticCanvas(null, { width: w, height: h });
      tempStatic.backgroundColor = '#000000';

      pathObjects.forEach((p) => {
        const cloned = fabric.util.object.clone(p);
        if ((cloned as any).set) {
          (cloned as any).set({ stroke: '#ffffff', fill: '#ffffff' });
        }
        tempStatic.add(cloned);
      });

      tempStatic.renderAll();
      const dataUrl = tempStatic.toDataURL({ format: 'png' });

      return new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          offCanvas.toBlob((blob) => resolve(blob), 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    },

    resetCalibration: () => {
      const { width: w, height: h } = imageDimsRef.current;
      const fullCoords: [number, number][] = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
      setCoordinates(fullCoords);
      createCalibrationMarkers(fullCoords);
    },

    applyPreset: (type: 'full' | 'center' | 'border' | 'motif') => {
      const { width: w, height: h } = imageDimsRef.current;
      let coords: [number, number][] = [];
      if (type === 'full') {
        coords = [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ];
      } else if (type === 'center') {
        coords = [
          [Math.round(w * 0.2), Math.round(h * 0.2)],
          [Math.round(w * 0.8), Math.round(h * 0.2)],
          [Math.round(w * 0.8), Math.round(h * 0.8)],
          [Math.round(w * 0.2), Math.round(h * 0.8)],
        ];
      } else if (type === 'border') {
        coords = [
          [Math.round(w * 0.05), Math.round(h * 0.65)],
          [Math.round(w * 0.95), Math.round(h * 0.65)],
          [Math.round(w * 0.95), Math.round(h * 0.95)],
          [Math.round(w * 0.05), Math.round(h * 0.95)],
        ];
      } else if (type === 'motif') {
        coords = [
          [Math.round(w * 0.35), Math.round(h * 0.52)],
          [Math.round(w * 0.68), Math.round(h * 0.52)],
          [Math.round(w * 0.68), Math.round(h * 0.88)],
          [Math.round(w * 0.35), Math.round(h * 0.88)],
        ];
      }
      setCoordinates(coords);
      createCalibrationMarkers(coords);
    },

    clearMask: () => {
      const canvas = fabricCanvas.current;
      if (!canvas) return;
      canvas.getObjects().forEach((o) => {
        if (o.type === 'path') {
          canvas.remove(o);
        }
      });
      canvas.requestRenderAll();
    },
  }));

  const handleApplyPreset = (type: 'full' | 'center' | 'border' | 'motif') => {
    const { width: w, height: h } = imageDimsRef.current;
    let coords: [number, number][] = [];
    if (type === 'full') {
      coords = [[0, 0], [w, 0], [w, h], [0, h]];
    } else if (type === 'center') {
      coords = [
        [Math.round(w * 0.2), Math.round(h * 0.2)],
        [Math.round(w * 0.8), Math.round(h * 0.2)],
        [Math.round(w * 0.8), Math.round(h * 0.8)],
        [Math.round(w * 0.2), Math.round(h * 0.8)],
      ];
    } else if (type === 'border') {
      coords = [
        [Math.round(w * 0.05), Math.round(h * 0.65)],
        [Math.round(w * 0.95), Math.round(h * 0.65)],
        [Math.round(w * 0.95), Math.round(h * 0.95)],
        [Math.round(w * 0.05), Math.round(h * 0.95)],
      ];
    } else if (type === 'motif') {
      coords = [
        [Math.round(w * 0.35), Math.round(h * 0.52)],
        [Math.round(w * 0.68), Math.round(h * 0.52)],
        [Math.round(w * 0.68), Math.round(h * 0.88)],
        [Math.round(w * 0.35), Math.round(h * 0.88)],
      ];
    }
    setCoordinates(coords);
    createCalibrationMarkers(coords);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '480px',
        position: 'relative',
      }}
    >
      {/* Floating Toolbar for Canvas Controls */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '6px 12px',
          background: 'rgba(13, 18, 32, 0.85)',
          backdropFilter: 'blur(12px)',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-border)',
          marginBottom: '12px',
          zIndex: 10,
        }}
      >
        {step === LoomStep.CALIBRATING && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className="text-xs text-muted font-medium mr-1">Presets:</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleApplyPreset('motif')}
              title="Crop to central saree motif / butta"
            >
              🥻 Motif Crop
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleApplyPreset('border')}
              title="Crop to lower zari border strip"
            >
              🌿 Zari Border
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleApplyPreset('center')}
              title="Crop to saree fabric body"
            >
              📦 Body Fabric
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleApplyPreset('full')}
              title="Reset 4 corners to entire image"
            >
              <RotateCcw size={12} /> Full Image
            </button>
          </div>
        )}

        {step === LoomStep.MASKING && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-danger"
            onClick={() => {
              const canvas = fabricCanvas.current;
              if (!canvas) return;
              canvas.getObjects().forEach((o) => {
                if (o.type === 'path') canvas.remove(o);
              });
              canvas.requestRenderAll();
            }}
            title="Clear all painted mask strokes"
          >
            <Trash2 size={13} /> Clear Mask
          </button>
        )}

        <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />

        <button
          type="button"
          className={`btn btn-sm ${isFit ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            setIsFit(true);
            applyFitOrZoom(true, 1);
          }}
          title="Fit image to window"
        >
          <Maximize2 size={13} /> Fit
        </button>

        <button
          type="button"
          className={`btn btn-sm ${!isFit && zoomLevel === 1 ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => {
            setIsFit(false);
            applyFitOrZoom(false, 1);
          }}
          title="Actual Size (100%)"
        >
          100%
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setIsFit(false);
            applyFitOrZoom(false, Math.min(zoomLevel + 0.2, 3));
          }}
          title="Zoom In"
        >
          <ZoomIn size={13} />
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setIsFit(false);
            applyFitOrZoom(false, Math.max(zoomLevel - 0.2, 0.2));
          }}
          title="Zoom Out"
        >
          <ZoomOut size={13} />
        </button>
      </div>

      {/* Canvas Mount */}
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          background: '#04060a',
          position: 'relative',
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
});

export default LoomCanvas;
