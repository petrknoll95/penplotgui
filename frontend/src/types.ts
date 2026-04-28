export interface Point {
  x: number;
  y: number;
}

export interface PathData {
  points: Point[];
  layer: number;
}

export interface Bed {
  width: number;
  height: number;
}

export interface Dimensions {
  width: number;
  height: number;
  scale: number;
  original_width: number;
  original_height: number;
  offset_x: number;
  offset_y: number;
}

export interface UploadResponse {
  filename: string;
  paths: PathData[];
  bed: Bed;
  dimensions?: Dimensions;
}

export interface ConvertResponse {
  gcode: string;
  stats: {
    initial_paths: number;
    final_paths: number;
    total_points: number;
    bounds: {
      x_min: number;
      y_min: number;
      x_max: number;
      y_max: number;
    } | null;
    gcode_lines: number;
  };
}

export interface PlotterStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'plotting' | 'paused' | 'error';
  position: {
    x: number;
    y: number;
    z: number;
  };
  progress: number;
  currentLine: number;
  totalLines: number;
  error: string | null;
}

export interface PlotterProfile {
  name: string;
  bed_width: number;
  bed_height: number;
  rapid_feed_rate: number;
  draw_feed_rate: number;
  pen_up_height: number;
  pen_down_height: number;
  steps_per_mm_x: number;
  steps_per_mm_y: number;
  steps_per_mm_z: number;
  easing_enabled: boolean;
}

export type OptimizationMethod = 'none' | 'greedy' | 'greedy_flip';

export const OPTIMIZATION_METHODS: { value: OptimizationMethod; label: string; description: string }[] = [
  { value: 'none', label: 'Document Order', description: 'Keep original SVG path order' },
  { value: 'greedy', label: 'Greedy', description: 'Nearest neighbor algorithm' },
  { value: 'greedy_flip', label: 'Greedy + Flip', description: 'Nearest neighbor with path reversal' },
];

// Artboard types
export type ArtboardPreset = '36x48' | 'a4' | 'a3' | 'a5' | 'letter' | 'custom';
export type ArtboardOrientation = 'portrait' | 'landscape';

export interface ArtboardSettings {
  enabled: boolean;
  preset: ArtboardPreset;
  width: number;
  height: number;
  orientation: ArtboardOrientation;
}

export const ARTBOARD_PRESETS: Record<Exclude<ArtboardPreset, 'custom'>, { width: number; height: number; label: string }> = {
  '36x48': { width: 360, height: 480, label: '36x48' },
  a4: { width: 210, height: 297, label: 'A4' },
  a3: { width: 297, height: 420, label: 'A3' },
  a5: { width: 148, height: 210, label: 'A5' },
  letter: { width: 216, height: 279, label: 'Letter' },
};
