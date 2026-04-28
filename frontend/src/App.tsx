import { useState, useEffect, useCallback, useRef, ReactElement } from 'react';
import { FileUpload } from './components/FileUpload';
import { SvgPreview } from './components/SvgPreview';
import { JogControls } from './components/JogControls';
import { SetHomeModal } from './components/SetHomeModal';
import { TimelineScrubber } from './components/TimelineScrubber';
import { Settings } from './components/Settings';
import { PositionControls, PositionSettings } from './components/PositionControls';
import { OptimizationControls } from './components/OptimizationControls';
import { Sidebar } from './components/Sidebar';
import { DraggablePanel, PanelDragLayer } from './components/DraggablePanel';
import { GearSix, X } from '@phosphor-icons/react';
import { api, createWebSocket } from './api';
import { PathData, Bed, PlotterStatus, Dimensions, OptimizationMethod, ArtboardSettings } from './types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { usePanelOrder, type PanelGroup } from './hooks/usePanelOrder';

const defaultStatus: PlotterStatus = {
  state: 'disconnected',
  position: { x: 0, y: 0, z: 0 },
  progress: 0,
  currentLine: 0,
  totalLines: 0,
  error: null,
};

// Hard limits for bed size (physical constraints - motors hit rails beyond this)
const MAX_BED_WIDTH = 426;
const MAX_BED_HEIGHT = 599;
const defaultBed: Bed = { width: MAX_BED_WIDTH, height: MAX_BED_HEIGHT };
const defaultArtboardSettings: ArtboardSettings = {
  enabled: true,
  preset: '36x48',
  width: 360,
  height: 480,
  orientation: 'portrait',
};

function App() {
  const [paths, setPaths] = useState<PathData[]>([]);
  const [bed, setBed] = useState<Bed>(defaultBed);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<PlotterStatus>(defaultStatus);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const [dimensions, setDimensions] = useState<Dimensions | undefined>(undefined);

  // Optimization state
  const [optimizationMethod, setOptimizationMethod] = useState<OptimizationMethod>('greedy_flip');
  const [positionSettings, setPositionSettings] = useState<PositionSettings>({
    alignment: 'center',
    margin: 0,
    scale_mode: 'fit',
    scale_value: 100,
    target_width: 100,
    target_height: 100,
    artboard_enabled: defaultArtboardSettings.enabled,
    artboard_width: defaultArtboardSettings.width,
    artboard_height: defaultArtboardSettings.height,
  });

  // Artboard state
  const [artboardSettings, setArtboardSettings] = useState<ArtboardSettings>(defaultArtboardSettings);

  // Timeline preview state
  const [previewPosition, setPreviewPosition] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef<number | null>(null);

  // Set Home modal state
  const [isSetHomeModalOpen, setIsSetHomeModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // WebSocket connection
  useEffect(() => {
    const ws = createWebSocket(
      (newStatus) => {
        setStatus((prev) => ({ ...prev, ...newStatus }));
      },
      (wsError) => {
        console.error('WebSocket error:', wsError);
      }
    );

    // Initial status fetch
    api.getStatus().then(setStatus).catch(console.error);

    return () => {
      ws.close();
    };
  }, []);

  // Playback animation
  useEffect(() => {
    if (isPreviewPlaying && paths.length > 0) {
      const interval = 200 / playbackSpeed; // Base interval adjusted by speed

      playbackRef.current = window.setInterval(() => {
        setPreviewPosition((prev) => {
          if (prev >= paths.length) {
            setIsPreviewPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, interval);

      return () => {
        if (playbackRef.current) {
          clearInterval(playbackRef.current);
        }
      };
    }
  }, [isPreviewPlaying, playbackSpeed, paths.length]);

  // Stop playback when reaching end
  useEffect(() => {
    if (previewPosition >= paths.length && isPreviewPlaying) {
      setIsPreviewPlaying(false);
    }
  }, [previewPosition, paths.length, isPreviewPlaying]);

  // Reset preview position when paths change (optimization/position updates)
  const pathsRef = useRef(paths);
  useEffect(() => {
    if (pathsRef.current !== paths && paths.length > 0) {
      setPreviewPosition(0);
      setIsPreviewPlaying(false);
    }
    pathsRef.current = paths;
  }, [paths]);

  // File upload handler
  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setIsPreviewUpdating(true);
    setError(null);

    try {
      const result = await api.uploadSvg(file);
      setPaths(result.paths);
      // Clamp bed size to hard limits
      setBed({
        width: Math.min(result.bed.width, MAX_BED_WIDTH),
        height: Math.min(result.bed.height, MAX_BED_HEIGHT),
      });
      setFilename(result.filename);
      setDimensions(result.dimensions);
      setPreviewPosition(0);
      setIsPreviewPlaying(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsLoading(false);
      setIsPreviewUpdating(false);
    }
  }, []);

  // Error handler
  const handleError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  // Timeline controls
  const handlePlayPause = useCallback(() => {
    if (previewPosition >= paths.length) {
      setPreviewPosition(0);
    }
    setIsPreviewPlaying((prev) => !prev);
  }, [previewPosition, paths.length]);

  const handleReset = useCallback(() => {
    setPreviewPosition(0);
    setIsPreviewPlaying(false);
  }, []);

  const isConnected = status.state !== 'disconnected' && status.state !== 'connecting';
  const isPlotting = status.state === 'plotting' || status.state === 'paused';
  const connectionButtonLabel = status.state === 'connecting' ? 'Connecting' : isConnected ? 'Disconnect' : 'Connect';
  const connectionButtonTooltip = status.error
    ? `Status: ${status.state}. ${status.error}`
    : isConnected && isPlotting
      ? `Status: ${status.state}. Disconnect is unavailable while the plotter is active.`
      : isConnected
        ? `Status: ${status.state}. Click to disconnect from the plotter.`
        : `Status: ${status.state}. Click to connect to the plotter.`;

  const handleConnect = useCallback(async () => {
    try {
      await api.connect();
    } catch (e) {
      handleError(e instanceof Error ? e.message : 'Connection failed');
    }
  }, [handleError]);

  const handleDisconnect = useCallback(async () => {
    try {
      await api.disconnect();
    } catch (e) {
      handleError(e instanceof Error ? e.message : 'Disconnect failed');
    }
  }, [handleError]);

  const handleTestPlot = useCallback(async () => {
    try {
      const width = artboardSettings.width;
      const height = artboardSettings.height;
      await api.testPlot(width, height);
    } catch (e) {
      handleError(e instanceof Error ? e.message : 'Failed to start test plot');
    }
  }, [artboardSettings.height, artboardSettings.width, handleError]);

  const handleStartPlot = useCallback(async () => {
    if (!filename) {
      handleError('No file selected');
      return;
    }

    try {
      await api.startPlot(filename, {
        optimization_method: optimizationMethod,
        alignment: positionSettings.alignment,
        margin: positionSettings.margin,
        scale_mode: positionSettings.scale_mode,
        scale_value: positionSettings.scale_value,
        target_width: positionSettings.target_width,
        target_height: positionSettings.target_height,
        artboard_enabled: true,
        artboard_width: artboardSettings.width,
        artboard_height: artboardSettings.height,
      });
    } catch (e) {
      handleError(e instanceof Error ? e.message : 'Failed to start plot');
    }
  }, [artboardSettings.height, artboardSettings.width, filename, handleError, optimizationMethod, positionSettings]);

  const { orders, reorder } = usePanelOrder();

  // Panel titles for drag preview
  const panelTitles: Record<string, string> = {
    position: 'Position & Size',
    optimization: 'Optimization',
    jog: 'Manual Control',
  };

  // Panel configuration - maps panel IDs to their rendered components
  const panels: Record<string, ReactElement> = {
    position: (
      <PositionControls
        filename={filename}
        onPathsUpdate={setPaths}
        onError={handleError}
        initialDimensions={dimensions}
        onSettingsChange={setPositionSettings}
        onDimensionsChange={setDimensions}
        optimizationMethod={optimizationMethod}
        artboardSettings={artboardSettings}
        onArtboardChange={setArtboardSettings}
        onPreviewUpdatingChange={setIsPreviewUpdating}
        bed={bed}
      />
    ),
    optimization: (
      <OptimizationControls
        filename={filename}
        currentSettings={positionSettings}
        onPathsUpdate={setPaths}
        onError={handleError}
        optimizationMethod={optimizationMethod}
        onMethodChange={setOptimizationMethod}
        onPreviewUpdatingChange={setIsPreviewUpdating}
      />
    ),
    jog: (
      <JogControls
        disabled={!isConnected || isPlotting}
        onError={handleError}
        onSetHome={() => setIsSetHomeModalOpen(true)}
      />
    ),
  };

  const renderPanelGroup = (group: PanelGroup) =>
    orders[group].map((panelId, index) => {
      const panel = panels[panelId];
      if (!panel) return null;
      return (
        <DraggablePanel
          key={panelId}
          id={panelId}
          group={group}
          index={index}
          title={panelTitles[panelId]}
          onReorder={(fromIndex, toIndex) => reorder(group, fromIndex, toIndex)}
        >
          {panel}
        </DraggablePanel>
      );
    });

  return (
    <div className="h-screen overflow-hidden bg-[rgba(12,12,12,1)] grid grid-cols-[320px_minmax(0,1fr)_320px] grid-rows-[3rem_minmax(0,1fr)]">
      <PanelDragLayer />

      <header
        aria-label="Application header"
        className="col-span-3 flex items-center justify-between gap-3 border-b border-foreground/5 bg-card px-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex gap-1 text-center">
            <div className="flex items-center p-2 gap-2 leading-none">
              <div className="text-sm text-muted-foreground">X</div>
              <div className="font-mono text-sm">{status.position.x.toFixed(2)}</div>
            </div>
            <div className="flex items-center p-2 gap-2 leading-none">
              <div className="text-sm text-muted-foreground">Y</div>
              <div className="font-mono text-sm">{status.position.y.toFixed(2)}</div>
            </div>
            <div className="flex items-center p-2 gap-2 leading-none">
              <div className="text-sm text-muted-foreground">Z</div>
              <div className="font-mono text-sm">{status.position.z.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Tooltip content={connectionButtonTooltip} side="bottom" align="end">
            <Button
              variant={status.state === 'error' ? "destructive" : isConnected ? "secondary" : "outline"}
              onClick={isConnected ? handleDisconnect : handleConnect}
              disabled={status.state === 'connecting' || (isConnected && isPlotting)}
            >
              {connectionButtonLabel}
            </Button>
          </Tooltip>
          <Button
            variant="outline"
            onClick={handleTestPlot}
            disabled={!isConnected || isPlotting || isLoading}
          >
            Test
          </Button>
          <Button
            variant="outline"
            onClick={handleStartPlot}
            disabled={!isConnected || !filename || isPlotting || isLoading || isPreviewUpdating}
          >
            Start Plot
          </Button>
          <Tooltip content="Settings" side="bottom" align="end">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Open settings"
            >
              <GearSix weight="bold" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <Sidebar side="left">
        <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} hasFile={paths.length > 0} />
        {renderPanelGroup('prepare')}
      </Sidebar>

      {/* Main Content */}
      <main className="relative min-w-0 w-full overflow-auto overscroll-none bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--color-foreground)_10%,var(--color-background))_.075em,transparent_.075em)] bg-size-[1em_1em]">
        {/* Error Banner */}
        {error && (
          <div className="mb-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="space-y-4">
          {paths.length > 0 && (
            <>
              <SvgPreview
                paths={paths}
                bed={bed}
                filename={filename || ''}
                currentPosition={isPlotting ? status.position : undefined}
                progress={isPlotting ? status.progress : 0}
                previewPosition={!isPlotting ? previewPosition : undefined}
                dimensions={dimensions}
                artboard={artboardSettings}
                isUpdating={isPreviewUpdating || isLoading}
              />

              {/* Timeline Scrubber - only show when not actively plotting */}
              {!isPlotting && (
                <TimelineScrubber
                  paths={paths}
                  bed={bed}
                  totalPaths={paths.length}
                  currentPosition={previewPosition}
                  onChange={setPreviewPosition}
                  isPlaying={isPreviewPlaying}
                  onPlayPause={handlePlayPause}
                  onReset={handleReset}
                  playbackSpeed={playbackSpeed}
                  onSpeedChange={setPlaybackSpeed}
                />
              )}
            </>
          )}

        </div>
      </main>

      <Sidebar side="right">
        {renderPanelGroup('machine')}
      </Sidebar>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-[440px] p-0">
          <div className="flex items-center justify-between border-b border-foreground/5 p-4">
            <DialogTitle>Settings</DialogTitle>
            <DialogClose
              aria-label="Close settings"
              className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X weight="bold" className="size-4" />
            </DialogClose>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
            <Settings
              onError={handleError}
              initialBedWidth={bed.width}
              initialBedHeight={bed.height}
              onBedSizeChange={(width, height) => setBed({ width, height })}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Set Home Modal */}
      <SetHomeModal
        isOpen={isSetHomeModalOpen}
        onClose={() => setIsSetHomeModalOpen(false)}
        onError={handleError}
        currentPosition={status.position}
      />
    </div>
  );
}

export default App;
