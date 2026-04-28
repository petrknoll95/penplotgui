import { useState } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import type { ConnectDragSource } from 'react-dnd';

interface JogControlsProps {
  disabled: boolean;
  onError: (error: string) => void;
  onSetHome: () => void;
  dragRef?: ConnectDragSource;
}

export function JogControls({ disabled, onError, onSetHome, dragRef }: JogControlsProps) {
  const [jogDistance, setJogDistance] = useState(10);

  const handleJog = async (axis: string, direction: number) => {
    try {
      // Uses rapid speed configured in Settings
      await api.jog(axis, jogDistance * direction);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Jog failed');
    }
  };

  const handlePenUp = async () => {
    try {
      await api.penUp();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Pen up failed');
    }
  };

  const handlePenDown = async () => {
    try {
      await api.penDown();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Pen down failed');
    }
  };

  const handleReset = async () => {
    try {
      await api.reset();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Reset failed');
    }
  };

  return (
    <SidebarPanel title="Manual Control" dragRef={dragRef}>
      <div className="flex flex-col gap-2 p-4">
        {/* Jog Distance Selection */}
        <div className="flex gap-2">
          {[1, 10, 50, 100].map((dist) => (
            <Button
              key={dist}
              variant={jogDistance === dist ? "default" : "outline"}
              onClick={() => setJogDistance(dist)}
            >
              {dist}mm
            </Button>
          ))}
        </div>

        {/* XY Jog Pad */}
        <div className="grid grid-cols-3">
          <div className="striped bg-[rgba(20,20,20,1)]"/>
          <div>
            <Button className="w-full" onClick={() => handleJog('Y', 1)} disabled={disabled}>
              Y+
            </Button>
          </div>
          <div className="striped bg-[rgba(20,20,20,1)]"/>
          <div>
            <Button className="w-full" onClick={() => handleJog('X', -1)} disabled={disabled}>
              X-
            </Button>
          </div>
          <div className="striped bg-[rgba(20,20,20,1)]"/>
          <div>
            <Button className="w-full" onClick={() => handleJog('X', 1)} disabled={disabled}>
              X+
            </Button>
          </div>
          <div className="striped bg-[rgba(20,20,20,1)]"/>
          <div>
            <Button className="w-full" onClick={() => handleJog('Y', -1)} disabled={disabled}>
              Y-
            </Button>
          </div>
          <div className="striped bg-[rgba(20,20,20,1)]"/>
        </div>

        {/* Z / Pen Controls */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePenUp} disabled={disabled}>
            Pen Up
          </Button>
          <Button variant="outline" onClick={handlePenDown} disabled={disabled}>
            Pen Down
          </Button>
        </div>

        {/* Z Jog */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleJog('Z', -1)} disabled={disabled}>
            Z-
          </Button>
          <Button variant="outline" onClick={() => handleJog('Z', 1)} disabled={disabled}>
            Z+
          </Button>
        </div>

        {/* Stop and Reset */}
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1" onClick={() => api.stopPlot()}>
            Stop
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleReset}>
            Reset
          </Button>
        </div>

        {/* Set Home */}
        <Button variant="outline" className="w-full" onClick={onSetHome} disabled={disabled}>
          Set Home Position
        </Button>
      </div>
    </SidebarPanel>
  );
}
