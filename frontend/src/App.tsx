import { useState, useEffect, useCallback, useRef, ReactElement } from 'react';
import { FileUpload } from './components/FileUpload';
import { SvgPreview } from './components/SvgPreview';
import { ControlPanel } from './components/ControlPanel';
import { JogControls } from './components/JogControls';
import { SetHomeModal } from './components/SetHomeModal';
import { TimelineScrubber } from './components/TimelineScrubber';
import { Settings } from './components/Settings';
import { PositionControls, PositionSettings } from './components/PositionControls';
import { OptimizationControls } from './components/OptimizationControls';
import { Sidebar } from './components/Sidebar';
import { DraggablePanel, PanelDragLayer } from './components/DraggablePanel';
import { api, createWebSocket } from './api';
import { PathData, Bed, PlotterStatus, Dimensions, OptimizationMethod, ArtboardSettings } from './types';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

function App() {
  const [paths, setPaths] = useState<PathData[]>([]);
  const [bed, setBed] = useState<Bed>(defaultBed);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<PlotterStatus>(defaultStatus);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
  });

  // Artboard state
  const [artboardSettings, setArtboardSettings] = useState<ArtboardSettings>({
    enabled: true,
    preset: '36x48',
    width: 360,
    height: 480,
    orientation: 'portrait',
  });

  // Timeline preview state
  const [previewPosition, setPreviewPosition] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef<number | null>(null);

  // Set Home modal state
  const [isSetHomeModalOpen, setIsSetHomeModalOpen] = useState(false);

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

  const { orders, reorder } = usePanelOrder();

  // Panel titles for drag preview
  const panelTitles: Record<string, string> = {
    position: 'Position & Size',
    optimization: 'Optimization',
    control: 'Plotter Control',
    jog: 'Manual Control',
    settings: 'Settings',
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
      />
    ),
    control: (
      <ControlPanel
        status={status}
        filename={filename}
        onError={handleError}
        optimizationMethod={optimizationMethod}
        positionSettings={positionSettings}
        artboardSettings={artboardSettings}
      />
    ),
    jog: (
      <JogControls
        disabled={!isConnected || isPlotting}
        onError={handleError}
        onSetHome={() => setIsSetHomeModalOpen(true)}
      />
    ),
    settings: (
      <Settings
        onError={handleError}
        initialBedWidth={bed.width}
        initialBedHeight={bed.height}
        onBedSizeChange={(width, height) => setBed({ width, height })}
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
    <div className="h-screen overflow-hidden bg-[rgba(12,12,12,1)] grid grid-cols-[320px_minmax(0,1fr)_320px]">
      <PanelDragLayer />

      <Sidebar side="left">
        <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} hasFile={paths.length > 0} />
        {renderPanelGroup('prepare')}
      </Sidebar>

      {/* Main Content */}
      <main className="relative min-w-0 w-full overflow-auto overscroll-none bg-[linear-gradient(rgba(20,20,20,1)_.1em,transparent_.1em),linear-gradient(90deg,rgba(20,20,20,1)_.1em,transparent_.1em)] bg-size-[0.5em_0.5em]">
        {/* Position Display */}
        <div className="absolute top-6 right-6 bg-card/90 backdrop-blur border border-foreground/10 rounded-lg px-4 py-2 font-mono text-sm z-10">
          <div className="flex gap-4">
            <span className="text-muted-foreground">X: <span className="text-foreground">{status.position.x.toFixed(2)}</span></span>
            <span className="text-muted-foreground">Y: <span className="text-foreground">{status.position.y.toFixed(2)}</span></span>
          </div>
        </div>

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
