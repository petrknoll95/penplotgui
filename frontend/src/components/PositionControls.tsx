import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlignBottomSimple,
  AlignCenterHorizontalSimple,
  AlignCenterVerticalSimple,
  AlignLeftSimple,
  AlignRightSimple,
  AlignTopSimple,
} from '@phosphor-icons/react';
import { PathData, Dimensions, Bed, ArtboardSettings, ArtboardPreset, ARTBOARD_PRESETS } from '../types';
import type { ConnectDragSource } from 'react-dnd';

type Alignment = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'custom';
type HorizontalAlignment = 'left' | 'center' | 'right';
type VerticalAlignment = 'top' | 'center' | 'bottom';
type ScaleMode = 'fit' | 'percent' | 'width' | 'height';
type RepositionOptions = {
  newAlignment?: Alignment;
  newScaleMode?: ScaleMode;
  newScalePercent?: number;
  newTargetWidth?: number;
  newTargetHeight?: number;
  nextArtboardSettings?: ArtboardSettings;
};

const ARTBOARD_PRESET_ORDER: ArtboardPreset[] = ['36x48', 'a4', 'a3', 'a5', 'letter', 'custom'];
const SCALE_MODE_ITEMS: Array<{ value: ScaleMode; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 'percent', label: '%' },
  { value: 'width', label: 'W' },
  { value: 'height', label: 'H' },
];
const HORIZONTAL_ALIGNMENT_ITEMS = [
  { value: 'left', ariaLabel: 'Align left', icon: AlignLeftSimple },
  { value: 'center', ariaLabel: 'Align horizontal center', icon: AlignCenterHorizontalSimple },
  { value: 'right', ariaLabel: 'Align right', icon: AlignRightSimple },
] satisfies Array<{ value: HorizontalAlignment; ariaLabel: string; icon: typeof AlignLeftSimple }>;
const VERTICAL_ALIGNMENT_ITEMS = [
  { value: 'top', ariaLabel: 'Align top', icon: AlignTopSimple },
  { value: 'center', ariaLabel: 'Align vertical center', icon: AlignCenterVerticalSimple },
  { value: 'bottom', ariaLabel: 'Align bottom', icon: AlignBottomSimple },
] satisfies Array<{ value: VerticalAlignment; ariaLabel: string; icon: typeof AlignTopSimple }>;

const getHorizontalAlignment = (alignment: Alignment): HorizontalAlignment | null => {
  if (alignment === 'custom') return null;
  if (alignment.includes('left')) return 'left';
  if (alignment.includes('right')) return 'right';
  return 'center';
};

const getVerticalAlignment = (alignment: Alignment): VerticalAlignment | null => {
  if (alignment === 'custom') return null;
  if (alignment.includes('top')) return 'top';
  if (alignment.includes('bottom')) return 'bottom';
  return 'center';
};

const composeAlignment = (
  horizontal: HorizontalAlignment,
  vertical: VerticalAlignment
): Alignment => {
  if (horizontal === 'center' && vertical === 'center') return 'center';
  if (horizontal === 'center') return vertical;
  if (vertical === 'center') return horizontal;
  return `${vertical}-${horizontal}` as Alignment;
};

const alignmentSegmentGroupClass =
  "grid grid-cols-3 gap-0 overflow-hidden rounded-md border border-button-border-idle bg-button-bg-idle p-0.5";
const alignmentSegmentClass =
  "h-7 min-w-0 rounded-none bg-transparent px-0 border-0 data-[pressed]:bg-secondary/25 text-foreground/40 data-[pressed]:text-foreground [&_svg:not([class*='size-'])]:size-4 rounded-sm";

const alignmentIconClass = "size-4";

const alignmentButtonIconWeight = "bold" as const;

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
  onPreviewUpdatingChange?: (isUpdating: boolean) => void;
  bed?: Bed;
}

export function PositionControls({ filename, onPathsUpdate, onError, initialDimensions, onSettingsChange, onDimensionsChange, optimizationMethod, dragRef, artboardSettings, onArtboardChange, onPreviewUpdatingChange, bed }: PositionControlsProps) {
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
  const repositionRequestIdRef = useRef(0);

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
      artboard_enabled: true,
      artboard_width: artboardSettings?.width,
      artboard_height: artboardSettings?.height,
    });
  }, []);

  const handleReposition = async (options: RepositionOptions = {}) => {
    if (!filename) return;

    const alignmentToUse = options.newAlignment ?? alignment;
    const scaleModeToUse = options.newScaleMode ?? scaleMode;
    const scalePercentToUse = options.newScalePercent ?? scalePercent;
    const targetWidthToUse = options.newTargetWidth ?? targetWidth;
    const targetHeightToUse = options.newTargetHeight ?? targetHeight;
    const baseArtboard = options.nextArtboardSettings ?? artboardSettings;
    if (!baseArtboard) return;
    const artboardToUse = { ...baseArtboard, enabled: true };

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
      artboard_enabled: true,
      artboard_width: artboardToUse?.width,
      artboard_height: artboardToUse?.height,
    };
    onSettingsChange?.(newSettings);

    const requestId = ++repositionRequestIdRef.current;
    setIsLoading(true);
    onPreviewUpdatingChange?.(true);
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
        artboard_enabled: true,
        artboard_width: artboardToUse?.width,
        artboard_height: artboardToUse?.height,
      });
      if (requestId !== repositionRequestIdRef.current) return;
      onPathsUpdate(result.paths);
      if (result.dimensions) {
        setDimensions(result.dimensions);
        onDimensionsChange?.(result.dimensions);
      }
    } catch (e) {
      if (requestId !== repositionRequestIdRef.current) return;
      onError(e instanceof Error ? e.message : 'Failed to reposition');
    } finally {
      if (requestId === repositionRequestIdRef.current) {
        setIsLoading(false);
        onPreviewUpdatingChange?.(false);
      }
    }
  };

  const applyArtboardSettings = (nextArtboardSettings: ArtboardSettings) => {
    const normalizedArtboardSettings = { ...nextArtboardSettings, enabled: true };
    onArtboardChange?.(normalizedArtboardSettings);
    void handleReposition({ nextArtboardSettings: normalizedArtboardSettings });
  };

  // Handle artboard preset change
  const handleArtboardPresetChange = (preset: ArtboardPreset) => {
    if (!onArtboardChange || !artboardSettings) return;

    if (preset === 'custom') {
      applyArtboardSettings({ ...artboardSettings, preset });
    } else {
      const presetData = ARTBOARD_PRESETS[preset];
      const isLandscape = artboardSettings.orientation === 'landscape';
      const width = isLandscape ? presetData.height : presetData.width;
      const height = isLandscape ? presetData.width : presetData.height;
      applyArtboardSettings({ ...artboardSettings, preset, width, height });
    }
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

    applyArtboardSettings({ ...artboardSettings, orientation: newOrientation, width: newWidth, height: newHeight });
  };

  // Check if orientation flip is allowed
  const canFlipOrientation = bed && artboardSettings
    ? artboardSettings.height <= bed.width && artboardSettings.width <= bed.height
    : true;
  const horizontalAlignment = getHorizontalAlignment(alignment);
  const verticalAlignment = getVerticalAlignment(alignment);

  if (!filename || !artboardSettings) return null;

  return (
    <SidebarPanel title="Position & Size" dragRef={dragRef}>
      <div className="flex flex-col gap-3 p-4">
        {/* Artboard Controls */}
        <div className="mb-2">
          <div className="mb-2">
            <label className="text-sm text-foreground/60">Artboard</label>
          </div>

          <div className="space-y-2 mt-2">
            {/* Preset selector */}
            <Select
              value={artboardSettings.preset}
              onValueChange={(value) => handleArtboardPresetChange(value as ArtboardPreset)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARTBOARD_PRESET_ORDER.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {preset === 'custom' ? 'Custom' : ARTBOARD_PRESETS[preset].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
                      onArtboardChange?.({ ...artboardSettings, enabled: true, width: newWidth });
                    }}
                    onBlur={() => handleReposition({ nextArtboardSettings: artboardSettings })}
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
                      onArtboardChange?.({ ...artboardSettings, enabled: true, height: newHeight });
                    }}
                    onBlur={() => handleReposition({ nextArtboardSettings: artboardSettings })}
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

        {/* Alignment Controls */}
        <div>
          <label className="text-sm text-foreground/60 mb-2 block">Alignment</label>
          <div className="grid grid-cols-2 gap-1">
            <ToggleGroup
              value={horizontalAlignment ? [horizontalAlignment] : []}
              onValueChange={(value) => {
                const nextHorizontal = value[0] as HorizontalAlignment | undefined;
                if (!nextHorizontal) return;
                const nextVertical = verticalAlignment ?? 'center';
                handleReposition({
                  newAlignment: composeAlignment(nextHorizontal, nextVertical),
                });
              }}
              disabled={isLoading}
              className={alignmentSegmentGroupClass}
            >
              {HORIZONTAL_ALIGNMENT_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <ToggleGroupItem
                    key={item.value}
                    value={item.value}
                    aria-label={item.ariaLabel}
                    title={item.ariaLabel}
                    className={alignmentSegmentClass}
                    size="sm"
                  >
                    <Icon className={alignmentIconClass} weight={alignmentButtonIconWeight} />
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>

            <ToggleGroup
              value={verticalAlignment ? [verticalAlignment] : []}
              onValueChange={(value) => {
                const nextVertical = value[0] as VerticalAlignment | undefined;
                if (!nextVertical) return;
                const nextHorizontal = horizontalAlignment ?? 'center';
                handleReposition({
                  newAlignment: composeAlignment(nextHorizontal, nextVertical),
                });
              }}
              disabled={isLoading}
              className={alignmentSegmentGroupClass}
            >
              {VERTICAL_ALIGNMENT_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <ToggleGroupItem
                    key={item.value}
                    value={item.value}
                    aria-label={item.ariaLabel}
                    title={item.ariaLabel}
                    className={alignmentSegmentClass}
                  >
                    <Icon className={alignmentIconClass} weight={alignmentButtonIconWeight} />
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
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
