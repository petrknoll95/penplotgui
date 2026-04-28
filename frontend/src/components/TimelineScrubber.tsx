import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CaretDoubleLeft,
  CaretLeft,
  Play,
  Pause,
  CaretRight,
  CaretDoubleRight,
} from '@phosphor-icons/react';
import { PathData, Bed } from '../types';

interface TimelineScrubberProps {
  paths: PathData[];
  bed: Bed;
  totalPaths: number;
  currentPosition: number;
  onChange: (position: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function formatDistance(d: number): string {
  if (d >= 1000) return `${(d / 1000).toFixed(2)}m`;
  return `${d.toFixed(1)}mm`;
}

export function TimelineScrubber({
  paths,
  bed,
  totalPaths,
  currentPosition,
  onChange,
  isPlaying,
  onPlayPause,
  onReset,
  playbackSpeed,
  onSpeedChange,
}: TimelineScrubberProps) {
  // Calculate current stats based on position
  const stats = useMemo(() => {
    let penDown = 0;
    let penUp = 0;
    let lastPos = { x: 0, y: 0 };

    for (let i = 0; i < currentPosition && i < paths.length; i++) {
      const path = paths[i];
      if (path.points.length === 0) continue;

      const pathStart = path.points[0];
      const pathEnd = path.points[path.points.length - 1];

      // Travel to start (pen up)
      penUp += calculateDistance(lastPos.x, lastPos.y, pathStart.x, pathStart.y);

      // Draw path (pen down)
      for (let j = 1; j < path.points.length; j++) {
        const p1 = path.points[j - 1];
        const p2 = path.points[j];
        penDown += calculateDistance(p1.x, p1.y, p2.x, p2.y);
      }

      lastPos = { x: pathEnd.x, y: pathEnd.y };
    }

    // Return home if complete
    if (currentPosition >= paths.length && paths.length > 0) {
      penUp += calculateDistance(lastPos.x, lastPos.y, 0, 0);
    }

    return { penDown, penUp, total: penDown + penUp };
  }, [paths, currentPosition]);

  // Calculate total stats for full drawing
  const totalStats = useMemo(() => {
    let penDown = 0;
    let penUp = 0;
    let lastPos = { x: 0, y: 0 };

    for (const path of paths) {
      if (path.points.length === 0) continue;

      const pathStart = path.points[0];
      const pathEnd = path.points[path.points.length - 1];

      penUp += calculateDistance(lastPos.x, lastPos.y, pathStart.x, pathStart.y);

      for (let j = 1; j < path.points.length; j++) {
        const p1 = path.points[j - 1];
        const p2 = path.points[j];
        penDown += calculateDistance(p1.x, p1.y, p2.x, p2.y);
      }

      lastPos = { x: pathEnd.x, y: pathEnd.y };
    }

    if (paths.length > 0) {
      penUp += calculateDistance(lastPos.x, lastPos.y, 0, 0);
    }

    return { penDown, penUp, total: penDown + penUp };
  }, [paths]);

  return (
    <div className="fixed bottom-0 left-0 right-80 border-t border-foreground/5 bg-background">
      {/* Stats row */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-b border-foreground/5">
        <span>{paths.length} paths | Bed: {bed.width}x{bed.height}mm</span>
        <div className="flex gap-6">
          <span>
            Pen Down: {formatDistance(stats.penDown)} / {formatDistance(totalStats.penDown)}
          </span>
          <span>
            Pen Up: {formatDistance(stats.penUp)} / {formatDistance(totalStats.penUp)}
          </span>
          <span>
            Total: {formatDistance(stats.total)} / {formatDistance(totalStats.total)}
          </span>
        </div>
        <span>Preview: {currentPosition}/{totalPaths} paths</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="aspect-square px-0" onClick={onReset} title="Reset to start">
            <CaretDoubleLeft className="h-4 w-4" weight="fill" />
          </Button>

          <Button
            variant="ghost"
            className="aspect-square px-0"
            onClick={() => onChange(Math.max(0, currentPosition - 1))}
            title="Previous path"
          >
            <CaretLeft className="h-4 w-4" weight="fill" />
          </Button>

          <Button className="aspect-square px-0" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause className="h-4 w-4" weight="fill" /> : <Play className="h-4 w-4" weight="fill" />}
          </Button>

          <Button
            variant="ghost"
            className="aspect-square px-0"
            onClick={() => onChange(Math.min(totalPaths, currentPosition + 1))}
            title="Next path"
          >
            <CaretRight className="h-4 w-4" weight="fill" />
          </Button>

          <Button
            variant="ghost"
            className="aspect-square px-0"
            onClick={() => onChange(totalPaths)}
            title="Skip to end"
          >
            <CaretDoubleRight className="h-4 w-4" weight="fill" />
          </Button>
        </div>

        <div className="flex-1">
          <Slider
            min={0}
            max={totalPaths}
            step={1}
            value={[currentPosition]}
            onValueChange={(value) => onChange(value[0])}
          />
        </div>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {currentPosition} / {totalPaths}
        </span>

        <div className="flex items-center gap-2">
          <Select
            value={playbackSpeed.toString()}
            onValueChange={(value) => onSpeedChange(parseFloat(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
              <SelectItem value="8">8x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
