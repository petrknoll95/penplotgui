import { useState, useEffect } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import { Switch } from '@/components/ui/switch';
import type { ConnectDragSource } from 'react-dnd';

interface SettingsProps {
  onError: (error: string) => void;
  initialBedWidth?: number;
  initialBedHeight?: number;
  initialRapidSpeed?: number;
  initialDrawSpeed?: number;
  initialEasingEnabled?: boolean;
  onBedSizeChange?: (width: number, height: number) => void;
  dragRef?: ConnectDragSource;
}

export function Settings({
  onError,
  initialBedWidth = 426,
  initialBedHeight = 599,
  initialRapidSpeed = 8000,
  initialDrawSpeed = 6000,
  initialEasingEnabled = true,
  onBedSizeChange,
  dragRef
}: SettingsProps) {
  const [bedWidth, setBedWidth] = useState(initialBedWidth);
  const [bedHeight, setBedHeight] = useState(initialBedHeight);
  const [rapidSpeed, setRapidSpeed] = useState(initialRapidSpeed);
  const [drawSpeed, setDrawSpeed] = useState(initialDrawSpeed);
  const [easingEnabled, setEasingEnabled] = useState(initialEasingEnabled);
  const [isSavingBed, setIsSavingBed] = useState(false);
  const [isSavingSpeed, setIsSavingSpeed] = useState(false);

  useEffect(() => {
    setBedWidth(initialBedWidth);
    setBedHeight(initialBedHeight);
  }, [initialBedWidth, initialBedHeight]);

  useEffect(() => {
    setRapidSpeed(initialRapidSpeed);
    setDrawSpeed(initialDrawSpeed);
    setEasingEnabled(initialEasingEnabled);
  }, [initialRapidSpeed, initialDrawSpeed, initialEasingEnabled]);

  const handleSaveBed = async () => {
    setIsSavingBed(true);
    try {
      await api.setBedSize(bedWidth, bedHeight);
      onBedSizeChange?.(bedWidth, bedHeight);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save bed size');
    } finally {
      setIsSavingBed(false);
    }
  };

  const handleSaveSpeed = async () => {
    setIsSavingSpeed(true);
    try {
      await api.setSpeedSettings(rapidSpeed, drawSpeed, easingEnabled);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save speed settings');
    } finally {
      setIsSavingSpeed(false);
    }
  };

  return (
    <SidebarPanel title="Settings" dragRef={dragRef}>
      <div className="flex flex-col gap-4 p-4">
        {/* Bed Size */}
        <div>
          <h3 className="text-sm font-medium text-foreground/80 mb-2">Bed Size (Soft Limits)</h3>
          <p className="mb-2 text-sm text-foreground/40">Max: 426 x 599 mm</p>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>Width (mm)</FieldLabel>
              <Input
                type="number"
                value={bedWidth}
                onChange={(e) => setBedWidth(Math.min(426, Number(e.target.value)))}
                min={1}
                max={426}
              />
            </Field>
            <Field>
              <FieldLabel>Height (mm)</FieldLabel>
              <Input
                type="number"
                value={bedHeight}
                onChange={(e) => setBedHeight(Math.min(599, Number(e.target.value)))}
                min={1}
                max={599}
              />
            </Field>
          </div>
          <Button onClick={handleSaveBed} disabled={isSavingBed} className="w-full mt-2" variant="outline">
            {isSavingBed ? 'Saving...' : 'Apply Bed Size'}
          </Button>
        </div>

        {/* Speed & Motion */}
        <div>
          <h3 className="text-sm font-medium text-foreground/80 mb-2">Speed & Motion</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm text-foreground/60 mb-1">
                <span>Rapid Speed (G0)</span>
                <span>{rapidSpeed} mm/min</span>
              </div>
              <Slider
                value={[rapidSpeed]}
                onValueChange={([value]) => setRapidSpeed(value)}
                min={500}
                max={10000}
                step={100}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm text-foreground/60 mb-1">
                <span>Draw Speed (G1)</span>
                <span>{drawSpeed} mm/min</span>
              </div>
              <Slider
                value={[drawSpeed]}
                onValueChange={([value]) => setDrawSpeed(value)}
                min={100}
                max={10000}
                step={100}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/60">Easing (Accel/Decel)</span>
              <Switch
                aria-label="Easing"
                checked={easingEnabled}
                onCheckedChange={setEasingEnabled}
              />
            </div>
          </div>
          <Button onClick={handleSaveSpeed} disabled={isSavingSpeed} className="w-full mt-2" variant="outline">
            {isSavingSpeed ? 'Saving...' : 'Apply Speed Settings'}
          </Button>
        </div>
      </div>
    </SidebarPanel>
  );
}
