import { useMemo } from 'react';
import { PathData, Bed, Dimensions, ArtboardSettings } from '../types';

interface SvgPreviewProps {
  paths: PathData[];
  bed: Bed;
  filename: string;
  currentPosition?: { x: number; y: number };
  progress?: number;
  previewPosition?: number;
  dimensions?: Dimensions;
  artboard?: ArtboardSettings;
  isUpdating?: boolean;
}


function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function SvgPreview({ paths, bed, filename, currentPosition, progress = 0, previewPosition, dimensions, artboard, isUpdating = false }: SvgPreviewProps) {
  const padding = 20;
  const viewBox = `${-padding} ${-padding} ${bed.width + padding * 2} ${bed.height + padding * 2}`;

  const totalPaths = paths.length;
  const completedPaths = previewPosition !== undefined
    ? previewPosition
    : Math.floor((progress / 100) * totalPaths);

  // Calculate all travel paths and pen position
  const { travelPaths, previewPenPosition } = useMemo(() => {
    const travels: { from: { x: number; y: number }; to: { x: number; y: number }; completed: boolean }[] = [];
    let lastPos = { x: 0, y: 0 };
    let currentPenPos = { x: 0, y: 0 };

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.points.length === 0) continue;

      const pathStart = path.points[0];
      const pathEnd = path.points[path.points.length - 1];
      const isCompleted = i < completedPaths;

      // Travel from last position to this path's start (pen up)
      const travelDist = calculateDistance(lastPos.x, lastPos.y, pathStart.x, pathStart.y);
      if (travelDist > 0.01) {
        travels.push({
          from: { ...lastPos },
          to: { x: pathStart.x, y: pathStart.y },
          completed: isCompleted,
        });
      }

      if (isCompleted) {
        currentPenPos = { x: pathEnd.x, y: pathEnd.y };
      } else if (i === completedPaths) {
        currentPenPos = { x: pathStart.x, y: pathStart.y };
      }

      lastPos = { x: pathEnd.x, y: pathEnd.y };
    }

    // Add return-to-home travel if fully complete
    if (completedPaths >= paths.length && paths.length > 0) {
      const lastPath = paths[paths.length - 1];
      if (lastPath.points.length > 0) {
        const lastPoint = lastPath.points[lastPath.points.length - 1];
        travels.push({
          from: { x: lastPoint.x, y: lastPoint.y },
          to: { x: 0, y: 0 },
          completed: true,
        });
        currentPenPos = { x: 0, y: 0 };
      }
    }

    return {
      travelPaths: travels,
      previewPenPosition: completedPaths > 0 || paths.length === 0 ? currentPenPos : null,
    };
  }, [paths, completedPaths]);

  return (
    <div className="p-4">
      <div className="bg-card border border-foreground/5 rounded-md overflow-clip shimmer-container relative">
        <div className={`absolute inset-0 shimmer-color-white/10 opacity-0 transition-all duration-400 ${isUpdating ? 'opacity-100 shimmer shimmer-bg' : ''}`}/>
        <div
          className={`transition-all duration-200 opacity-100 ${isUpdating ? 'opacity-50 animate-pulse' : ''}`}
          aria-busy={isUpdating}
        >
          <div className="px-4 py-2 border-b border-[rgba(30,30,30,1)] text-sm text-muted-foreground">
            {filename}
          </div>
          <svg
            viewBox={viewBox}
            className="w-full h-auto max-h-screen"
          >
            {/* Flip Y-axis so 0,0 is bottom-left like the plotter */}
            <g transform={`translate(0, ${bed.height}) scale(1, -1)`}>
              {/* Bed outline */}
              <rect
                x={0}
                y={0}
                width={bed.width}
                height={bed.height}
                fill="none"
                stroke="#ccc"
                strokeWidth="1"
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />

              {/* Artboard outline */}
              {artboard && (
                <rect
                  x={0}
                  y={0}
                  width={artboard.width}
                  height={artboard.height}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* SVG canvas outline */}
              {dimensions && (
                <rect
                  x={dimensions.offset_x}
                  y={dimensions.offset_y}
                  width={dimensions.width}
                  height={dimensions.height}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.6}
                />
              )}

              {/* Travel paths (pen up) - show all, highlight completed */}
              {travelPaths.map((travel, idx) => (
                <line
                  key={`travel-${idx}`}
                  x1={travel.from.x}
                  y1={travel.from.y}
                  x2={travel.to.x}
                  y2={travel.to.y}
                  stroke={travel.completed ? '#f97316' : '#d1d5db'}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity={travel.completed ? 0.8 : 0.4}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Future travel paths (not yet shown in travelPaths) */}
              {paths.slice(completedPaths > 0 ? completedPaths - 1 : 0).map((path, relIdx) => {
                const idx = (completedPaths > 0 ? completedPaths - 1 : 0) + relIdx;
                const nextPath = paths[idx + 1];
                if (!nextPath || idx < completedPaths - 1) return null;

                const lastPoint = path.points[path.points.length - 1];
                const firstPoint = nextPath.points[0];
                if (!lastPoint || !firstPoint) return null;

                return (
                  <line
                    key={`future-travel-${idx}`}
                    x1={lastPoint.x}
                    y1={lastPoint.y}
                    x2={firstPoint.x}
                    y2={firstPoint.y}
                    stroke="#d1d5db"
                    strokeWidth={0.3}
                    strokeDasharray="2 2"
                    opacity={0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {/* Drawing paths */}
              {paths.map((path, pathIndex) => {
                const isComplete = pathIndex < completedPaths;
                const points = path.points.map((p) => `${p.x},${p.y}`).join(' ');

                return (
                  <polyline
                    key={pathIndex}
                    points={points}
                    fill="none"
                    stroke={isComplete ? '#22c55e' : '#3b82f6'}
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isComplete ? 1 : 0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {/* Current position indicator (from plotter) */}
              {currentPosition && (
                <g transform={`translate(${currentPosition.x}, ${currentPosition.y})`}>
                  <circle r={2} fill="#ef4444" vectorEffect="non-scaling-stroke" />
                  <circle r={4} fill="none" stroke="#ef4444" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                </g>
              )}

              {/* Preview pen position indicator */}
              {previewPenPosition && !currentPosition && previewPosition !== undefined && (
                <g transform={`translate(${previewPenPosition.x}, ${previewPenPosition.y})`}>
                  <circle r={2} fill="#8b5cf6" vectorEffect="non-scaling-stroke" />
                  <circle r={4} fill="none" stroke="#8b5cf6" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                  <circle r={6} fill="none" stroke="#8b5cf6" strokeWidth={0.25} opacity={0.5} vectorEffect="non-scaling-stroke" />
                </g>
              )}

              {/* Home position marker */}
              <g transform="translate(0, 0)">
                <rect x={-1} y={-1} width={2} height={2} fill="#fff" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
