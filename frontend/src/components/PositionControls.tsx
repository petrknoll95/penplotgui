import { useState, useEffect } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import { PathData, Dimensions, Bed, ArtboardSettings, ArtboardPreset, ARTBOARD_PRESETS } from '../types';
import type { ConnectDragSource } from 'react-dnd';

type Alignment = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'custom';
type ScaleMode = 'fit' | 'percent' | 'width' | 'height';

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
            <label className="text-xs text-foreground/60">Artboard</label>
            <Button
              variant={artboardSettings?.enabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleArtboardToggle}
            >
              {artboardSettings?.enabled ? 'On' : 'Off'}
            </Button>
          </div>

          {artboardSettings?.enabled && (
            <div className="space-y-2 mt-2">
              {/* Preset selector */}
              <div className="flex gap-1 flex-wrap">
                {(['36x48', 'a4', 'a3', 'a5', 'letter', 'custom'] as ArtboardPreset[]).map((preset) => (
                  <Button
                    key={preset}
                    variant={artboardSettings.preset === preset ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleArtboardPresetChange(preset)}
                  >
                    {preset === 'custom' ? 'Custom' : ARTBOARD_PRESETS[preset].label}
                  </Button>
                ))}
              </div>

              {/* Orientation toggle */}
              <div className="flex gap-1">
                <Button
                  variant={artboardSettings.orientation === 'portrait' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => artboardSettings.orientation !== 'portrait' && handleOrientationToggle()}
                  disabled={artboardSettings.orientation === 'portrait'}
                >
                  Portrait
                </Button>
                <Button
                  variant={artboardSettings.orientation === 'landscape' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => artboardSettings.orientation !== 'landscape' && handleOrientationToggle()}
                  disabled={artboardSettings.orientation === 'landscape' || !canFlipOrientation}
                  title={!canFlipOrientation ? 'Landscape orientation exceeds bed size' : ''}
                >
                  Landscape
                </Button>
              </div>

              {/* Custom dimensions */}
              {artboardSettings.preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-foreground/40 mb-1 block">Width (mm)</label>
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
                    <label className="text-xs text-foreground/40 mb-1 block">Height (mm)</label>
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
                <div className="text-xs text-foreground/40">
                  {artboardSettings.width} × {artboardSettings.height} mm
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current Dimensions Display */}
        {dimensions && (
          <div className="bg-foreground/5 rounded p-2 text-xs">
            <div className="flex justify-between text-foreground/60">
              <span>Size:</span>
              <span className="font-mono">{dimensions.width.toFixed(1)} × {dimensions.height.toFixed(1)} mm</span>
            </div>
          </div>
        )}

        {/* Scale Mode */}
        <div>
          <label className="text-xs text-foreground/60 mb-2 block">Scale</label>
          <div className="grid grid-cols-4 gap-1">
            <Button
              variant={scaleMode === 'fit' ? 'default' : 'outline'}

              onClick={() => handleReposition({ newScaleMode: 'fit' })}
              disabled={isLoading}
            >
              Fit
            </Button>
            <Button
              variant={scaleMode === 'percent' ? 'default' : 'outline'}

              onClick={() => handleReposition({ newScaleMode: 'percent' })}
              disabled={isLoading}
            >
              %
            </Button>
            <Button
              variant={scaleMode === 'width' ? 'default' : 'outline'}

              onClick={() => handleReposition({ newScaleMode: 'width' })}
              disabled={isLoading}
            >
              W
            </Button>
            <Button
              variant={scaleMode === 'height' ? 'default' : 'outline'}

              onClick={() => handleReposition({ newScaleMode: 'height' })}
              disabled={isLoading}
            >
              H
            </Button>
          </div>
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
          <label className="text-xs text-foreground/60 mb-2 block">Alignment</label>
          <div className="grid grid-cols-3">
            <div>
              <Button
                className="w-full"
                variant={alignment === 'top-left' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'top-left' })}
                disabled={isLoading}
              >
                ↖
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'top' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'top' })}
                disabled={isLoading}
              >
                ↑
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'top-right' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'top-right' })}
                disabled={isLoading}
              >
                ↗
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'left' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'left' })}
                disabled={isLoading}
              >
                ←
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'center' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'center' })}
                disabled={isLoading}
              >
                ◎
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'right' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'right' })}
                disabled={isLoading}
              >
                →
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'bottom-left' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'bottom-left' })}
                disabled={isLoading}
              >
                ↙
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'bottom' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'bottom' })}
                disabled={isLoading}
              >
                ↓
              </Button>
            </div>
            <div>
              <Button
                className="w-full"
                variant={alignment === 'bottom-right' ? 'default' : 'outline'}
                onClick={() => handleReposition({ newAlignment: 'bottom-right' })}
                disabled={isLoading}
              >
                ↘
              </Button>
            </div>
          </div>
        </div>

        {/* Margin */}
        <div>
          <label className="text-xs text-foreground/60 mb-1 block">Margin (mm)</label>
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
            <label className="text-xs text-foreground/60">Custom Position</label>
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
              <label className="text-xs text-foreground/40 mb-1 block">X (mm)</label>
              <Input
                type="number"
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                step={1}
              />
            </div>
            <div>
              <label className="text-xs text-foreground/40 mb-1 block">Y (mm)</label>
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
