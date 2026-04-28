import { PlotterStatus, OptimizationMethod, ArtboardSettings } from '../types';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SidebarPanel } from '@/components/ui/sidebar-panel';
import type { ConnectDragSource } from 'react-dnd';
import type { PositionSettings } from './PositionControls';

interface ControlPanelProps {
  status: PlotterStatus;
  filename: string | null;
  onError: (error: string) => void;
  optimizationMethod?: OptimizationMethod;
  positionSettings?: PositionSettings;
  artboardSettings?: ArtboardSettings;
  dragRef?: ConnectDragSource;
}

export function ControlPanel({ status, filename, onError, optimizationMethod = 'greedy_flip', positionSettings, artboardSettings, dragRef }: ControlPanelProps) {
  const isConnected = status.state !== 'disconnected' && status.state !== 'connecting';
  const isPlotting = status.state === 'plotting';
  const isPaused = status.state === 'paused';

  const handleConnect = async () => {
    try {
      await api.connect();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnect();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Disconnect failed');
    }
  };

  const handleTestPlot = async () => {
    try {
      // Use artboard dimensions if enabled, otherwise use default A4
      const width = artboardSettings?.enabled ? artboardSettings.width : 210;
      const height = artboardSettings?.enabled ? artboardSettings.height : 297;
      await api.testPlot(width, height);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to start test plot');
    }
  };

  const handleStartPlot = async () => {
    if (!filename) {
      onError('No file selected');
      return;
    }
    try {
      await api.startPlot(filename, {
        optimization_method: optimizationMethod,
        alignment: positionSettings?.alignment,
        margin: positionSettings?.margin,
        scale_mode: positionSettings?.scale_mode,
        scale_value: positionSettings?.scale_value,
        target_width: positionSettings?.target_width,
        target_height: positionSettings?.target_height,
        artboard_enabled: artboardSettings?.enabled,
        artboard_width: artboardSettings?.width,
        artboard_height: artboardSettings?.height,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to start plot');
    }
  };

  const handlePause = async () => {
    try {
      await api.pausePlot();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to pause');
    }
  };

  const handleResume = async () => {
    try {
      await api.resumePlot();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to resume');
    }
  };

  const handleStop = async () => {
    try {
      await api.stopPlot();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to stop');
    }
  };

  const handleHome = async () => {
    try {
      await api.home();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to home');
    }
  };

  const handleReset = async () => {
    try {
      await api.reset();
      // Force a page reload to reset WebSocket and all state
      window.location.reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to reset');
    }
  };

  return (
    <SidebarPanel title="Plotter Control" dragRef={dragRef}>
      <div className="flex flex-col gap-2 p-4">
          {/* Connection Status */}
          <div className="flex items-start justify-between">
            <Badge variant={isConnected ? "success" : "secondary"}>
              <span className={`size-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-foreground/30'}`} />
              {status.state}
            </Badge>
            {!isConnected ? (
              <Button variant="outline" onClick={handleConnect}>Connect</Button>
            ) : (
              <Button variant="secondary" onClick={handleDisconnect}>Disconnect</Button>
            )}
          </div>

          {/* Position Display */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="flex flex-col items-center p-2 bg-foreground/5 rounded-md">
              <div className="text-sm text-muted-foreground">X</div>
              <div className="font-mono text-sm">{status.position.x.toFixed(2)}</div>
            </div>
            <div className="flex flex-col items-center p-2 bg-foreground/5 rounded-md">
              <div className="text-sm text-muted-foreground">Y</div>
              <div className="font-mono text-sm">{status.position.y.toFixed(2)}</div>
            </div>
            <div className="flex flex-col items-center p-2 bg-foreground/5 rounded-md">
              <div className="text-sm text-muted-foreground">Z</div>
              <div className="font-mono text-sm">{status.position.z.toFixed(2)}</div>
            </div>
          </div>

          {/* Progress Bar */}
          {(isPlotting || isPaused) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>{status.progress.toFixed(1)}%</span>
              </div>
              <Progress value={status.progress} />
              <div className="text-sm text-muted-foreground">
                Line {status.currentLine} / {status.totalLines}
              </div>
            </div>
          )}

          {/* Plot Controls */}
          <div className="w-full flex gap-2">
            {!isPlotting && !isPaused && (
              <>
                <Button
                  variant="outline"
                  onClick={handleTestPlot}
                  disabled={!isConnected}
                >
                  Test
                </Button>
                <Button
                  onClick={handleStartPlot}
                  disabled={!isConnected || !filename}
                  className="flex-1"
                  variant="outline"
                >
                  Start Plot
                </Button>
              </>
            )}
            {isPlotting && (
              <Button variant="outline" onClick={handlePause}>
                Pause
              </Button>
            )}
            {isPaused && (
              <Button onClick={handleResume}>
                Resume
              </Button>
            )}
            {(isPlotting || isPaused) && (
              <Button variant="destructive" onClick={handleStop}>
                Stop
              </Button>
            )}
          </div>

          {/* Home Button */}
          <Button
            variant="outline"
            onClick={handleHome}
            disabled={!isConnected || isPlotting}
          >
            Home All Axes
          </Button>

          {/* Error Display */}
          {status.error && (
            <Alert variant="destructive">
              <AlertDescription>{status.error}</AlertDescription>
            </Alert>
          )}

          {/* Reset Button - shows when there's an error or state is stuck */}
          {(status.error || status.state === 'error' || isPaused) && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="w-full text-destructive border-destructive/50 hover:bg-destructive/10"
            >
              Reset Connection
            </Button>
          )}
      </div>
    </SidebarPanel>
  );
}
