import { UploadResponse, ConvertResponse, PlotterStatus, PlotterProfile } from './types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
}

export const api = {
  // File operations
  async uploadSvg(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<UploadResponse>(response);
  },

  async repositionSvg(
    filename: string,
    options: {
      alignment?: string;
      offset_x?: number;
      offset_y?: number;
      margin?: number;
      scale_mode?: string;
      scale_value?: number;
      target_width?: number;
      target_height?: number;
      optimization_method?: string;
      artboard_enabled?: boolean;
      artboard_width?: number;
      artboard_height?: number;
    } = {}
  ): Promise<UploadResponse> {
    const response = await fetch(`${API_BASE}/reposition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, ...options }),
    });
    return handleResponse<UploadResponse>(response);
  },

  async convertSvg(
    filename: string,
    options: {
      optimization_method?: string;
      scale_to_fit?: boolean;
      margin?: number;
      profile?: string;
    } = {}
  ): Promise<ConvertResponse> {
    const response = await fetch(`${API_BASE}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, ...options }),
    });
    return handleResponse<ConvertResponse>(response);
  },

  // Plotter control
  async connect(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/connect`, { method: 'POST' });
    await handleResponse(response);
  },

  async disconnect(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/disconnect`, { method: 'POST' });
    await handleResponse(response);
  },

  async getStatus(): Promise<PlotterStatus> {
    const response = await fetch(`${API_BASE}/plotter/status`);
    return handleResponse<PlotterStatus>(response);
  },

  async startPlot(
    filename: string,
    options: {
      optimization_method?: string;
      scale_to_fit?: boolean;
      margin?: number;
      profile?: string;
      alignment?: string;
      offset_x?: number;
      offset_y?: number;
      scale_mode?: string;
      scale_value?: number;
      target_width?: number;
      target_height?: number;
      artboard_enabled?: boolean;
      artboard_width?: number;
      artboard_height?: number;
    } = {}
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/plot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, ...options }),
    });
    await handleResponse(response);
  },

  async testPlot(width: number, height: number): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/test-plot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height }),
    });
    await handleResponse(response);
  },

  async pausePlot(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/pause`, { method: 'POST' });
    await handleResponse(response);
  },

  async resumePlot(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/resume`, { method: 'POST' });
    await handleResponse(response);
  },

  async stopPlot(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/stop`, { method: 'POST' });
    await handleResponse(response);
  },

  async reset(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/reset`, { method: 'POST' });
    await handleResponse(response);
  },

  async home(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/home`, { method: 'POST' });
    await handleResponse(response);
  },

  async jog(axis: string, distance: number): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/jog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ axis, distance }),
    });
    await handleResponse(response);
  },

  async penUp(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/pen/up`, { method: 'POST' });
    await handleResponse(response);
  },

  async penDown(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/pen/down`, { method: 'POST' });
    await handleResponse(response);
  },

  async setSoftLimitsEnabled(enabled: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/soft-limits?enabled=${enabled}`, { method: 'POST' });
    await handleResponse(response);
  },

  async setHome(): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/set-home`, { method: 'POST' });
    await handleResponse(response);
  },

  async sendCommand(command: string): Promise<string> {
    const response = await fetch(`${API_BASE}/plotter/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const result = await handleResponse<{ response: string }>(response);
    return result.response;
  },

  // Profiles
  async getProfiles(): Promise<{ profiles: Record<string, PlotterProfile>; active: string }> {
    const response = await fetch(`${API_BASE}/profiles`);
    return handleResponse(response);
  },

  async saveProfile(name: string, profile: PlotterProfile): Promise<void> {
    const response = await fetch(`${API_BASE}/profiles/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    await handleResponse(response);
  },

  async activateProfile(name: string): Promise<void> {
    const response = await fetch(`${API_BASE}/profiles/${name}/activate`, { method: 'POST' });
    await handleResponse(response);
  },

  // Bed size
  async setBedSize(width: number, height: number): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/bed-size`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ width, height }),
    });
    await handleResponse(response);
  },

  // Steps per mm
  async setStepsPerMm(x: number, y: number, z: number): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/steps-per-mm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, z }),
    });
    await handleResponse(response);
  },

  // Speed settings
  async setSpeedSettings(rapidFeedRate: number, drawFeedRate: number, easingEnabled: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/plotter/speed-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rapid_feed_rate: rapidFeedRate, draw_feed_rate: drawFeedRate, easing_enabled: easingEnabled }),
    });
    await handleResponse(response);
  },
};

// WebSocket connection
export function createWebSocket(
  onStatus: (status: PlotterStatus) => void,
  onError: (error: string) => void
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        onStatus(data as PlotterStatus);
      }
    } catch {
      console.error('Failed to parse WebSocket message');
    }
  };

  ws.onerror = () => {
    onError('WebSocket connection error');
  };

  ws.onclose = () => {
    onError('WebSocket connection closed');
  };

  return ws;
}
