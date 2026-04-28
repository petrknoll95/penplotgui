import { useState, useEffect } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';

interface SetHomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onError: (error: string) => void;
  currentPosition: { x: number; y: number };
}

export function SetHomeModal({ isOpen, onClose, onError, currentPosition }: SetHomeModalProps) {
  const [jogDistance, setJogDistance] = useState(10);

  // Disable soft limits when modal opens, re-enable on close
  useEffect(() => {
    if (isOpen) {
      api.setSoftLimitsEnabled(false).catch(e =>
        onError(e instanceof Error ? e.message : 'Failed to disable soft limits')
      );
    }
    return () => {
      if (isOpen) {
        api.setSoftLimitsEnabled(true).catch(e =>
          onError(e instanceof Error ? e.message : 'Failed to enable soft limits')
        );
      }
    };
  }, [isOpen, onError]);

  const handleJog = async (axis: string, direction: number) => {
    try {
      await api.jog(axis, jogDistance * direction);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Jog failed');
    }
  };

  const handleSave = async () => {
    try {
      await api.setHome();
      await api.setSoftLimitsEnabled(true);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to set home');
    }
  };

  const handleCancel = async () => {
    try {
      await api.setSoftLimitsEnabled(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to enable soft limits');
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-foreground/10 rounded-lg p-6 w-[360px] shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Set Home Position</h2>

        <p className="text-sm text-muted-foreground mb-4">
          Use the jog controls to move to the desired home position.
          Soft limits are disabled - be careful not to crash the machine.
        </p>

        {/* Current Position */}
        <div className="bg-background/50 rounded px-3 py-2 mb-4 font-mono text-sm">
          <span className="text-muted-foreground">Position: </span>
          <span>X: {currentPosition.x.toFixed(2)}</span>
          <span className="ml-3">Y: {currentPosition.y.toFixed(2)}</span>
        </div>

        {/* Jog Distance Selection */}
        <div className="flex gap-2 mb-4">
          {[1, 10, 50, 100].map((dist) => (
            <Button
              key={dist}
              variant={jogDistance === dist ? "default" : "outline"}
              size="sm"
              onClick={() => setJogDistance(dist)}
            >
              {dist}mm
            </Button>
          ))}
        </div>

        {/* XY Jog Pad */}
        <div className="grid grid-cols-3 gap-1 mb-4">
          <div />
          <Button onClick={() => handleJog('Y', 1)}>Y+</Button>
          <div />
          <Button onClick={() => handleJog('X', -1)}>X-</Button>
          <div className="bg-background/30 rounded" />
          <Button onClick={() => handleJog('X', 1)}>X+</Button>
          <div />
          <Button onClick={() => handleJog('Y', -1)}>Y-</Button>
          <div />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Set as Home (0,0)
          </Button>
        </div>
      </div>
    </div>
  );
}
