import { useState } from 'react';
import { api } from '../api';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PathData, OptimizationMethod, OPTIMIZATION_METHODS } from '../types';
import type { ConnectDragSource } from 'react-dnd';

interface OptimizationControlsProps {
  filename: string | null;
  currentSettings: {
    alignment: string;
    margin: number;
    scale_mode: string;
    scale_value: number;
    target_width: number;
    target_height: number;
  };
  onPathsUpdate: (paths: PathData[]) => void;
  onError: (error: string) => void;
  optimizationMethod: OptimizationMethod;
  onMethodChange: (method: OptimizationMethod) => void;
  dragRef?: ConnectDragSource;
}

export function OptimizationControls({
  filename,
  currentSettings,
  onPathsUpdate,
  onError,
  optimizationMethod,
  onMethodChange,
  dragRef,
}: OptimizationControlsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleMethodChange = async (newMethod: OptimizationMethod) => {
    if (!filename) return;

    onMethodChange(newMethod);
    setIsLoading(true);

    try {
      const result = await api.repositionSvg(filename, {
        ...currentSettings,
        optimization_method: newMethod,
      });
      onPathsUpdate(result.paths);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Optimization failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!filename) return null;

  const currentMethodInfo = OPTIMIZATION_METHODS.find(m => m.value === optimizationMethod);

  return (
    <SidebarPanel title="Optimization" dragRef={dragRef}>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <label className="text-sm text-foreground/60 mb-2 block">Path Order</label>
          <Select
            value={optimizationMethod}
            onValueChange={(v) => handleMethodChange(v as OptimizationMethod)}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPTIMIZATION_METHODS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentMethodInfo && (
          <p className="text-sm text-foreground/40">
            {currentMethodInfo.description}
          </p>
        )}
      </div>
    </SidebarPanel>
  );
}
