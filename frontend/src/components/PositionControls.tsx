import { useState, useEffect } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PathData, Dimensions, Bed, ArtboardSettings, ArtboardPreset, ARTBOARD_PRESETS } from '../types';
import type { ConnectDragSource } from 'react-dnd';

type Alignment = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'custom';
type ScaleMode = 'fit' | 'percent' | 'width' | 'height';

const ARTBOARD_PRESET_ORDER: ArtboardPreset[] = ['36x48', 'a4', 'a3', 'a5', 'letter', 'custom'];
const SCALE_MODE_ITEMS: Array<{ value: ScaleMode; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 'percent', label: '%' },
  { value: 'width', label: 'W' },
  { value: 'height', label: 'H' },
];
const ALIGNMENT_ITEMS: Array<{ value: Alignment; label: string; ariaLabel: string }> = [
  { value: 'top-left', label: '↖', ariaLabel: 'Align top left' },
  { value: 'top', label: '↑', ariaLabel: 'Align top' },
  { value: 'top-right', label: '↗', ariaLabel: 'Align top right' },
  { value: 'left', label: '←', ariaLabel: 'Align left' },
  { value: 'center', label: '◎', ariaLabel: 'Align center' },
  { value: 'right', label: '→', ariaLabel: 'Align right' },
  { value: 'bottom-left', label: '↙', ariaLabel: 'Align bottom left' },
  { value: 'bottom', label: '↓', ariaLabel: 'Align bottom' },
  { value: 'bottom-right', label: '↘', ariaLabel: 'Align bottom right' },
];

export interface PositionSettings {
  alignment: string;
  margin: number;
  scale_mode: string;
  scale_value: number;
  target_width: number;
  target_height: number;
  artboard_enabled?: boolean;
  artboard_width?: number;
  artboard_height?: number;
}

interface PositionControlsProps {
  filename: string | null;
  onPathsUpdate: (paths: PathData[]) => void;
  onError: (error: string) => void;
  initialDimensions?: Dimensions;
  onSettingsChange?: (settings: PositionSettings) => void;
  onDimensionsChange?: (dimensions: Dimensions) => void;
  optimizationMethod?: string;
  dragRef?: ConnectDragSource;
  artboardSettings?: ArtboardSettings;
  onArtboardChange?: (settings: ArtboardSettings) => void;
  bed?: Bed;
}

export function PositionControls({ filename, onPathsUpdate, onError, initialDimensions, onSettingsChange, onDimensionsChange, optimizationMethod, dragRef, artboardSettings, onArtboardChange, bed }: PositionControlsProps) {
  const [alignment, setAlignment] = useState<Alignment>('center');
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [margin, setMargin] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Scale controls
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit');
  const [scalePercent, setScalePercent] = useState(100);
  const [targetWidth, setTargetWidth] = useState(100);
  const [targetHeight, setTargetHeight] = useState(100);
  const [dimensions, setDimensions] = useState<Dimensions | null>(initialDimensions || null);

  useEffect(() => {
    if (initialDimensions) {
      setDimensions(initialDimensions);
      setTargetWidth(Math.round(initialDimensions.width));
      setTargetHeight(Math.round(initialDimensions.height));
    }
  }, [initialDimensions]);

  // When a new file is loaded, apply current settings so preview updates immediately
  useEffect(() => {
    if (!filename) return;
    // Apply existing UI settings (alignment/scale/artboard) to the new SVG
    handleReposition({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  // Notify parent of initial settings
  useEffect(() => {
    onSettingsChange?.({
      alignment,
      margin,
      scale_mode: scaleMode,
      scale_value: scalePercent,
      target_width: targetWidth,
      target_height: targetHeight,
    });
  }, []);

  const handleReposition = async (options: {
    newAlignment?: Alignment;
    newScaleMode?: ScaleMode;
    newScalePercent?: number;
    newTargetWidth?: number;
    newTargetHeight?: number;
  } = {}) => {
    if (!filename) return;

    const alignmentToUse = options.newAlignment ?? alignment;
    const scaleModeToUse = options.newScaleMode ?? scaleMode;
    const scalePercentToUse = options.newScalePercent ?? scalePercent;
    const targetWidthToUse = options.newTargetWidth ?? targetWidth;
    const targetHeightToUse = options.newTargetHeight ?? targetHeight;

    if (options.newAlignment) setAlignment(alignmentToUse);
    if (options.newScaleMode) setScaleMode(scaleModeToUse);
    if (options.newScalePercent) setScalePercent(scalePercentToUse);
    if (options.newTargetWidth) setTargetWidth(targetWidthToUse);
    if (options.newTargetHeight) setTargetHeight(targetHeightToUse);

    // Notify parent of settings change
    const newSettings: PositionSettings = {
      alignment: alignmentToUse,
      margin,
      scale_mode: scaleModeToUse,
      scale_value: scalePercentToUse,
      target_width: targetWidthToUse,
      target_height: targetHeightToUse,
      artboard_enabled: artboardSettings?.enabled,
      artboard_width: artboardSettings?.width,
      artboard_height: artboardSettings?.height,
    };
    onSettingsChange?.(newSettings);

    setIsLoading(true);
    try {
      const result = await api.repositionSvg(filename, {
        alignment: alignmentToUse,
        offset_x: alignmentToUse === 'custom' ? offsetX : 0,
        offset_y: alignmentToUse === 'custom' ? offsetY : 0,
        margin,
        scale_mode: scaleModeToUse,
        scale_value: scalePercentToUse,
        target_width: targetWidthToUse,
        target_height: targetHeightToUse,
        optimization_method: optimizationMethod,
        artboard_enabled: artboardSettings?.enabled,
        artboard_width: artboardSettings?.width,
        artboard_height: artboardSettings?.height,
      });
      onPathsUpdate(result.paths);
      if (result.dimensions) {
        setDimensions(result.dimensions);
        onDimensionsChange?.(result.dimensions);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to reposition');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle artboard preset change
  const handleArtboardPresetChange = (preset: ArtboardPreset) => {
    if (!onArtboardChange || !artboardSettings) return;

    if (preset === 'custom') {
      onArtboardChange({ ...artboardSettings, preset });
    } else {
      const presetData = ARTBOARD_PRESETS[preset];
      const isLandscape = artboardSettings.orientation === 'landscape';
      const width = isLandscape ? presetData.height : presetData.width;
      const height = isLandscape ? presetData.width : presetData.height;
      onArtboardChange({ ...artboardSettings, preset, width, height });
    }
    // Trigger reposition with new artboard size
    setTimeout(() => handleReposition({}), 0);
  };

  // Handle artboard orientation toggle
  const handleOrientationToggle = () => {
    if (!onArtboardChange || !artboardSettings || !bed) return;

    const newOrientation = artboardSettings.orientation === 'portrait' ? 'landscape' : 'portrait';
    const newWidth = artboardSettings.height;
    const newHeight = artboardSettings.width;

    // Check if flipped dimensions fit in bed
    if (newWidth > bed.width || newHeight > bed.height) {
      return; // Don't allow flip if it exceeds bed
    }

    onArtboardChange({ ...artboardSettings, orientation: newOrientation, width: newWidth, height: newHeight });
    // Trigger reposition with new artboard size
    setTimeout(() => handleReposition({}), 0);
  };

  // Handle artboard enable/disable
  const handleArtboardToggle = () => {
    if (!onArtboardChange || !artboardSettings) return;
    const newEnabled = !artboardSettings.enabled;
    onArtboardChange({ ...artboardSettings, enabled: newEnabled });
    // Trigger reposition
    setTimeout(() => handleReposition({}), 0);
  };

  // Check if orientation flip is allowed
  const canFlipOrientation = bed && artboardSettings
    ? artboardSettings.height <= bed.width && artboardSettings.width <= bed.height
    : true;

  if (!filename) return null;

  return (
    <SidebarPanel title="Position & Size" dragRef={dragRef}>
      <div className="flex flex-col gap-3 p-4">
        {/* Artboard Controls */}
        <div className="border border-foreground/10 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-foreground/60">Artboard</label>
            <Switch
              aria-label="Artboard"
              checked={Boolean(artboardSettings?.enabled)}
              onCheckedChange={handleArtboardToggle}
            />
          </div>

          {artboardSettings?.enabled && (
            <div className="space-y-2 mt-2">
              {/* Preset selector */}
              <ToggleGroup
                value={[artboardSettings.preset]}
                onValueChange={(value) => {
                  const preset = value[0] as ArtboardPreset | undefined;
                  if (preset) handleArtboardPresetChange(preset);
                }}
                className="flex-wrap justify-start"
              >
                {ARTBOARD_PRESET_ORDER.map((preset) => (
                  <ToggleGroupItem
                    key={preset}
                    value={preset}
                    size="sm"
                    className="flex-none"
                  >
                    {preset === 'custom' ? 'Custom' : ARTBOARD_PRESETS[preset].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Orientation toggle */}
              <ToggleGroup
                value={[artboardSettings.orientation]}
                onValueChange={(value) => {
                  const orientation = value[0];
                  if (orientation && orientation !== artboardSettings.orientation) {
                    handleOrientationToggle();
                  }
                }}
              >
                <ToggleGroupItem value="portrait" size="sm">
                  Portrait
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="landscape"
                  size="sm"
                  disabled={!canFlipOrientation}
                  title={!canFlipOrientation ? 'Landscape orientation exceeds bed size' : ''}
                >
                  Landscape
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Custom dimensions */}
              {artboardSettings.preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-foreground/40 mb-1 block">Width (mm)</label>
                    <Input
                      type="number"
                      value={artboardSettings.width}
                      onChange={(e) => {
                        const newWidth = Math.min(Number(e.target.value), bed?.width || 426);
                        onArtboardChange?.({ ...artboardSettings, width: newWidth });
                      }}
                      onBlur={() => handleReposition({})}
                      min={10}
                      max={bed?.width || 426}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-foreground/40 mb-1 block">Height (mm)</label>
                    <Input
                      type="number"
                      value={artboardSettings.height}
                      onChange={(e) => {
                        const newHeight = Math.min(Number(e.target.value), bed?.height || 599);
                        onArtboardChange?.({ ...artboardSettings, height: newHeight });
                      }}
                      onBlur={() => handleReposition({})}
                      min={10}
                      max={bed?.height || 599}
                    />
                  </div>
                </div>
              )}

              {/* Size display for presets */}
              {artboardSettings.preset !== 'custom' && (
                <div className="text-sm text-foreground/40">
                  {artboardSettings.width} × {artboardSettings.height} mm
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current Dimensions Display */}
        {dimensions && (
          <div className="bg-foreground/5 rounded p-2 text-sm">
            <div className="flex justify-between text-foreground/60">
              <span>Size:</span>
              <span className="font-mono">{dimensions.width.toFixed(1)} × {dimensions.height.toFixed(1)} mm</span>
            </div>
          </div>
        )}

        {/* Scale Mode */}
        <div>
          <label className="text-sm text-foreground/60 mb-2 block">Scale</label>
          <ToggleGroup
            value={[scaleMode]}
            onValueChange={(value) => {
              const nextScaleMode = value[0] as ScaleMode | undefined;
              if (nextScaleMode) handleReposition({ newScaleMode: nextScaleMode });
            }}
            disabled={isLoading}
          >
            {SCALE_MODE_ITEMS.map((item) => (
              <ToggleGroupItem key={item.value} value={item.value}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Scale Value Input */}
        {scaleMode === 'percent' && (
          <div className="flex gap-2">
            <Input
              type="number"
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              min={1}
              max={500}
              className="flex-1"
            />
            <span className="self-center text-foreground/60">%</span>
            <Button
              variant="outline"

              onClick={() => handleReposition({ newScalePercent: scalePercent })}
              disabled={isLoading}
            >
              Apply
            </Button>
          </div>
        )}

        {scaleMode === 'width' && (
          <div className="flex gap-2">
            <Input
              type="number"
              value={targetWidth}
              onChange={(e) => setTargetWidth(Number(e.target.value))}
              min={1}
              className="flex-1"
            />
            <span className="self-center text-foreground/60">mm</span>
            <Button
              variant="outline"

              onClick={() => handleReposition({ newTargetWidth: targetWidth })}
              disabled={isLoading}
            >
              Apply
            </Button>
          </div>
        )}

        {scaleMode === 'height' && (
          <div className="flex gap-2">
            <Input
              type="number"
              value={targetHeight}
              onChange={(e) => setTargetHeight(Number(e.target.value))}
              min={1}
              className="flex-1"
            />
            <span className="self-center text-foreground/60">mm</span>
            <Button
              variant="outline"

              onClick={() => handleReposition({ newTargetHeight: targetHeight })}
              disabled={isLoading}
            >
              Apply
            </Button>
          </div>
        )}

        {/* Alignment Grid */}
        <div>
          <label className="text-sm text-foreground/60 mb-2 block">Alignment</label>
          <ToggleGroup
            value={[alignment]}
            onValueChange={(value) => {
              const nextAlignment = value[0] as Alignment | undefined;
              if (nextAlignment) handleReposition({ newAlignment: nextAlignment });
            }}
            disabled={isLoading}
            className="grid grid-cols-3"
          >
            {ALIGNMENT_ITEMS.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                aria-label={item.ariaLabel}
                className="w-full"
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Margin */}
        <div>
          <label className="text-sm text-foreground/60 mb-1 block">Margin (mm)</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              min={0}
              className="flex-1"
            />
            <Button
              variant="outline"

              onClick={() => handleReposition({})}
              disabled={isLoading}
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Custom Offset */}
        <div className="border border-foreground/10 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-foreground/60">Custom Position</label>
            <Button
              variant={alignment === 'custom' ? 'default' : 'ghost'}

              onClick={() => handleReposition({ newAlignment: 'custom' })}
              disabled={isLoading}
            >
              Use
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm text-foreground/40 mb-1 block">X (mm)</label>
              <Input
                type="number"
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                step={1}
              />
            </div>
            <div>
              <label className="text-sm text-foreground/40 mb-1 block">Y (mm)</label>
              <Input
                type="number"
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                step={1}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarPanel>
  );
}
