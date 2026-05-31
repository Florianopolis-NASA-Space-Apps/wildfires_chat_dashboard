import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Mic,
  RefreshCw,
  Square,
  X,
} from 'react-feather';
import { Button } from '../button/Button';
import { Spinner } from '../spinner/Spinner';
import { WavRecorder, WavStreamPlayer } from '../../lib/wavtools';
import { WavRenderer } from '../../utils/wav_renderer';
import {
  RealtimeClient,
  type SessionConfig,
  type RealtimeToolDefinition,
} from '../../lib/realtime/RealtimeClient';
import {
  countObservationsInBoundingBox,
  type BoundingBoxObservationStats,
} from '../../utils/wildfireDb';
import type { BoundingBox } from '../../types/geospatial';
import { lookupBoundingBoxForPlace } from '../../utils/geocoding';
import {
  formatDateForResponse,
  parseDateArg,
  type DateRange,
} from '../../utils/dates';
import type { IMapCoords, MapMarkerDetails } from '../mbox/MBox';
import { COLORS } from '../../constants/colors';
import { isEmbeddedInIframe } from '../../utils/iframeEmbed';
import {
  OPEN_METEO_ARCHIVE_URL,
  OPEN_METEO_FORECAST_URL,
} from '../../constants/links';
import './RealtimeVoiceModal.scss';

const CONVERSATION_STARTERS = [
  '✈️ Fly to Florianópolis',
  '🔥 How many wildfires are in Brazil?',
  '🌧️ When was the last rain in Los Angeles?',
  "☀️ What's the weather like in Buenos Aires?",
  '🗓️ Change the dates to January 6th - January 8th',
];

const PROD_BASE_URL = 'https://api.apps.archlife.org';
const DEV_BASE_URL = 'http://localhost:4317';
const VOICE_RELAY_ENDPOINT = `${PROD_BASE_URL}/api/grow/relay`;
const RELAY_SESSION_EXPIRY_BUFFER_MS = 5_000;
const INTERACTIVITY_TOOL_CALL_RULES = [
  'Tool call policy:',
  '- For dashboard UI changes, prefer calling control_dashboard_interactivity.',
  '- If the user asks to change or move map location, call fly_to_place for named places or apply_map_location for known coordinates before replying.',
  '- If the user asks to change wildfire dates/timeframe, call apply_date_range before replying.',
  '- After a dashboard tool succeeds, briefly tell the user the request was received and applied.',
  '- Do not claim UI was updated unless the tool call succeeded.',
].join('\n');

const FLY_TO_PLACE_TOOL_DEFINITION: RealtimeToolDefinition = {
  name: 'fly_to_place',
  description:
    'FASTEST way to navigate the map to a location. Instantly geocodes place name and flies map there. Use this for all navigation requests.',
  parameters: {
    type: 'object',
    required: ['place'],
    properties: {
      place: {
        type: 'string',
        description:
          'City, region, or country name (e.g., "Tokyo", "California", "Brazil").',
      },
      location: {
        type: 'string',
        description: 'Alternate place field.',
      },
      destination: {
        type: 'string',
        description: 'Alternate place field.',
      },
      query: {
        type: 'string',
        description: 'Alternate place field.',
      },
    },
    additionalProperties: false,
  },
};

const APPLY_MAP_LOCATION_TOOL_DEFINITION: RealtimeToolDefinition = {
  name: 'apply_map_location',
  description:
    'Moves the wildfire dashboard map to exact coordinates. Use when latitude and longitude are already known.',
  parameters: {
    type: 'object',
    required: ['lat', 'lng'],
    properties: {
      lat: { type: 'number', description: 'Latitude' },
      lng: { type: 'number', description: 'Longitude' },
      latitude: { type: 'number', description: 'Alternate latitude field' },
      longitude: { type: 'number', description: 'Alternate longitude field' },
      lon: { type: 'number', description: 'Alternate longitude field' },
      location: {
        type: 'string',
        description: 'Optional label for the map marker.',
      },
      place: {
        type: 'string',
        description: 'Optional label for the map marker.',
      },
    },
    additionalProperties: false,
  },
};

const APPLY_DATE_RANGE_TOOL_DEFINITION: RealtimeToolDefinition = {
  name: 'apply_date_range',
  description:
    'Updates the wildfire observation date range shown in the dashboard. Prefer YYYY-MM-DD values but natural language dates are also accepted.',
  parameters: {
    type: 'object',
    required: ['start_date', 'end_date'],
    properties: {
      start_date: {
        type: 'string',
        description:
          'Inclusive start date in YYYY-MM-DD format (e.g., 2025-01-06).',
      },
      end_date: {
        type: 'string',
        description:
          'Inclusive end date in YYYY-MM-DD format (e.g., 2025-01-10).',
      },
      start: { type: 'string', description: 'Alternate key for start date.' },
      end: { type: 'string', description: 'Alternate key for end date.' },
      startDate: {
        type: 'string',
        description: 'Alternate key for start date.',
      },
      endDate: {
        type: 'string',
        description: 'Alternate key for end date.',
      },
      from: { type: 'string', description: 'Alternate key for start date.' },
      to: { type: 'string', description: 'Alternate key for end date.' },
      range: {
        type: 'string',
        description:
          'Single string range, such as "2025-01-06 to 2025-01-08" or "January 6 - January 8".',
      },
      timeframe: {
        type: 'string',
        description: 'Alternate single string date range.',
      },
      date_range: {
        type: 'object',
        description: 'Nested date range object. Can contain start/end style keys.',
        additionalProperties: true,
      },
      dateRange: {
        type: 'object',
        description: 'Nested date range object. Can contain start/end style keys.',
        additionalProperties: true,
      },
      dates: {
        type: 'object',
        description: 'Nested dates object. Can contain start/end style keys.',
        additionalProperties: true,
      },
    },
    additionalProperties: false,
  },
};

const REQUIRED_INTERACTIVITY_TOOL_DEFINITIONS: RealtimeToolDefinition[] = [
  FLY_TO_PLACE_TOOL_DEFINITION,
  APPLY_MAP_LOCATION_TOOL_DEFINITION,
  APPLY_DATE_RANGE_TOOL_DEFINITION,
];

type GrowRelaySession = {
  clientSecret: string;
  expiresAt: number | null;
  websocketUrl: string;
  session: Record<string, unknown>;
};

type VoiceSessionStatus =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'running'
  | 'error';

interface RealtimeLogEntry {
  time: string;
  source: 'client' | 'server';
  event: { type?: string;[key: string]: unknown };
}

interface RealtimeVoiceModalProps {
  onMarkerUpdate: (update: Partial<MapMarkerDetails>) => void;
  onMapPositionChange: (coords: IMapCoords | null) => void;
  onObservationQueryChange: (query: string | null) => void;
  onObservationValueChange: (value: BoundingBoxObservationStats | null) => void;
  onResetContext: () => void;
  isLargeScreen: boolean;
  onDateRangeChange: (range: DateRange) => void;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseBoundingBoxArg(arg: unknown): BoundingBox {
  if (!arg || typeof arg !== 'object') {
    throw new Error('Bounding box must be an object.');
  }
  const record = arg as Record<string, unknown>;
  const north = toFiniteNumber(record.north);
  const south = toFiniteNumber(record.south);
  const east = toFiniteNumber(record.east);
  const west = toFiniteNumber(record.west);

  if (north === null || south === null || east === null || west === null) {
    throw new Error(
      'Bounding box requires numeric north, south, east, and west values.'
    );
  }

  return {
    north,
    south,
    east,
    west,
  };
}

function getToolArgValue({
  args,
  keys,
}: {
  args: Record<string, unknown> | null | undefined;
  keys: string[];
}): unknown {
  if (!args) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      return args[key];
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getStringToolArg({
  args,
  keys,
}: {
  args: Record<string, unknown> | null | undefined;
  keys: string[];
}): string | null {
  const raw = getToolArgValue({ args, keys });
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

function getDateRangeInputs({
  args,
}: {
  args: Record<string, unknown>;
}): {
  startInput: unknown;
  endInput: unknown;
} {
  const rangeContainer = asRecord(
    getToolArgValue({
      args,
      keys: ['date_range', 'dateRange', 'dates'],
    })
  );

  const startInput =
    getToolArgValue({
      args,
      keys: [
        'start_date',
        'startDate',
        'start',
        'from',
        'begin',
        'start_at',
        'startAt',
      ],
    }) ??
    getToolArgValue({
      args: rangeContainer,
      keys: [
        'start_date',
        'startDate',
        'start',
        'from',
        'begin',
        'start_at',
        'startAt',
      ],
    });

  const endInput =
    getToolArgValue({
      args,
      keys: ['end_date', 'endDate', 'end', 'to', 'until', 'end_at', 'endAt'],
    }) ??
    getToolArgValue({
      args: rangeContainer,
      keys: ['end_date', 'endDate', 'end', 'to', 'until', 'end_at', 'endAt'],
    });

  if (startInput !== undefined && endInput !== undefined) {
    return { startInput, endInput };
  }

  const rangeText = getStringToolArg({
    args,
    keys: ['range', 'timeframe', 'date_span', 'dateSpan'],
  });
  if (!rangeText) {
    return { startInput, endInput };
  }

  const parts = rangeText
    .split(/\s+(?:to|through|until)\s+|\s*[-–—]\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length >= 2) {
    return { startInput: parts[0], endInput: parts[1] };
  }

  return { startInput, endInput };
}

function parseFlexibleDateArg({
  value,
  label,
}: {
  value: unknown;
  label: string;
}): Date {
  if (typeof value !== 'string' || !value.trim().length) {
    throw new Error(`${label} must be a non-empty date string.`);
  }

  const raw = value.trim();
  try {
    return parseDateArg(raw, label);
  } catch (_error) {
    const normalized = raw.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
    const parsedMs = Date.parse(normalized);
    if (Number.isNaN(parsedMs)) {
      throw new Error(
        `${label} must be a valid date. Use YYYY-MM-DD when possible.`
      );
    }
    const parsed = new Date(parsedMs);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
}

function getPlaceFromToolArgs({
  args,
}: {
  args: Record<string, unknown>;
}): string | null {
  const directPlace = getStringToolArg({
    args,
    keys: [
      'place',
      'location',
      'destination',
      'query',
      'city',
      'region',
      'country',
      'name',
    ],
  });
  if (directPlace) {
    return directPlace;
  }

  const nestedLocation = asRecord(
    getToolArgValue({
      args,
      keys: ['location_data', 'locationData'],
    })
  );
  return getStringToolArg({
    args: nestedLocation,
    keys: ['place', 'location', 'name', 'label'],
  });
}

function formatUnknownForLog(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function summarizeBoundingBox(bounds: BoundingBox, label?: string): string {
  const parts: string[] = [];
  if (label && label.trim().length) {
    parts.push(`Region: ${label.trim()}`);
  }
  const latMin = Math.min(bounds.north, bounds.south);
  const latMax = Math.max(bounds.north, bounds.south);
  parts.push(`Latitude: ${latMin.toFixed(2)}° to ${latMax.toFixed(2)}°`);
  if (bounds.east < bounds.west) {
    parts.push(
      `Longitude: wraps dateline (${bounds.west.toFixed(
        2
      )}° → 180° and -180° → ${bounds.east.toFixed(2)}°)`
    );
  } else {
    const lonMin = Math.min(bounds.west, bounds.east);
    const lonMax = Math.max(bounds.west, bounds.east);
    parts.push(`Longitude: ${lonMin.toFixed(2)}° to ${lonMax.toFixed(2)}°`);
  }
  return parts.join('\n');
}

function normalizeExpirationTimestamp(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null;
    }
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.length) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return null;
  }
  return null;
}

function mergeSessionInstructions({
  baseInstructions,
  appendedInstructions,
}: {
  baseInstructions: string | undefined;
  appendedInstructions: string;
}): string {
  const base = typeof baseInstructions === 'string' ? baseInstructions.trim() : '';
  if (!base.length) {
    return appendedInstructions;
  }
  if (base.includes(appendedInstructions)) {
    return base;
  }
  return `${base}\n\n${appendedInstructions}`;
}

function cloneRealtimeToolDefinition(
  tool: RealtimeToolDefinition
): SessionConfig['tools'][number] {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ? { ...tool.parameters } : undefined,
  };
}

function buildRequiredInteractivityToolDefinitions(): SessionConfig['tools'] {
  return REQUIRED_INTERACTIVITY_TOOL_DEFINITIONS.map(cloneRealtimeToolDefinition);
}

function isRelayToolDefinition(value: unknown): value is SessionConfig['tools'][number] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === 'function' &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    (record.description === undefined || typeof record.description === 'string') &&
    (record.parameters === undefined ||
      (typeof record.parameters === 'object' &&
        record.parameters !== null &&
        !Array.isArray(record.parameters)))
  );
}

function hasExpirationElapsed(
  expiresAt: number | null,
  bufferMs: number = 0
): boolean {
  if (expiresAt === null) {
    return false;
  }
  return Date.now() >= expiresAt - bufferMs;
}

function extractRelaySessionConfig(
  session: Record<string, unknown>
): Partial<SessionConfig> {
  const config: Partial<SessionConfig> = {};
  if (
    Array.isArray(session.modalities) &&
    session.modalities.every((entry) => typeof entry === 'string')
  ) {
    config.modalities = session.modalities as SessionConfig['modalities'];
  }
  if (typeof session.instructions === 'string') {
    config.instructions = session.instructions;
  }
  if (typeof session.voice === 'string') {
    config.voice = session.voice;
  }
  if (
    session.input_audio_format === 'pcm16' ||
    session.input_audio_format === 'g711_ulaw' ||
    session.input_audio_format === 'g711_alaw'
  ) {
    config.input_audio_format = session.input_audio_format;
  }
  if (
    session.output_audio_format === 'pcm16' ||
    session.output_audio_format === 'g711_ulaw' ||
    session.output_audio_format === 'g711_alaw'
  ) {
    config.output_audio_format = session.output_audio_format;
  }
  if (
    session.input_audio_transcription === null ||
    (typeof session.input_audio_transcription === 'object' &&
      session.input_audio_transcription !== null &&
      !Array.isArray(session.input_audio_transcription))
  ) {
    config.input_audio_transcription =
      session.input_audio_transcription as SessionConfig['input_audio_transcription'];
  }
  if (
    session.turn_detection === null ||
    (typeof session.turn_detection === 'object' &&
      session.turn_detection !== null &&
      !Array.isArray(session.turn_detection))
  ) {
    config.turn_detection = session.turn_detection as SessionConfig['turn_detection'];
  }
  if (typeof session.temperature === 'number' && Number.isFinite(session.temperature)) {
    config.temperature = session.temperature;
  }
  if (
    session.max_response_output_tokens === 'inf' ||
    (typeof session.max_response_output_tokens === 'number' &&
      Number.isFinite(session.max_response_output_tokens))
  ) {
    config.max_response_output_tokens =
      session.max_response_output_tokens as SessionConfig['max_response_output_tokens'];
  }
  if (
    session.tool_choice === 'auto' ||
    session.tool_choice === 'none' ||
    session.tool_choice === 'required' ||
    (typeof session.tool_choice === 'object' &&
      session.tool_choice !== null &&
      !Array.isArray(session.tool_choice))
  ) {
    config.tool_choice = session.tool_choice as SessionConfig['tool_choice'];
  }
  if (Array.isArray(session.tools)) {
    const tools = session.tools.filter(isRelayToolDefinition).map((tool) => ({
      ...tool,
      name: tool.name.trim(),
      description: tool.description?.trim(),
      parameters: tool.parameters ? { ...tool.parameters } : undefined,
    }));
    if (tools.length) {
      config.tools = tools;
    }
  }
  return config;
}

export function RealtimeVoiceModal({
  onMarkerUpdate,
  onMapPositionChange,
  onObservationQueryChange,
  onObservationValueChange,
  onResetContext,
  isLargeScreen,
  onDateRangeChange,
}: RealtimeVoiceModalProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeLogEntry[]>([]);
  const [conversationItems, setConversationItems] = useState<any[]>([]);
  const [expandedEventIndex, setExpandedEventIndex] = useState<number | null>(
    null
  );
  const [hasPressedStart, setHasPressedStart] = useState(false);
  const voiceStatusRef = useRef<VoiceSessionStatus>('idle');
  const clientRef = useRef<RealtimeClient | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const playerRef = useRef<WavStreamPlayer | null>(null);
  const animationRef = useRef<number>();
  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlerRefs = useRef<
    Array<{ event: string; handler: (event: any) => void }>
  >([]);

  const logToolTrace = useCallback(
    ({
      stage,
      details,
      level = 'info',
    }: {
      stage: string;
      details?: Record<string, unknown>;
      level?: 'info' | 'warn' | 'error';
    }) => {
      const payload = details ?? {};
      if (level === 'error') {
        console.error('[VoiceToolTrace:UI]', stage, payload);
        return;
      }
      if (level === 'warn') {
        console.warn('[VoiceToolTrace:UI]', stage, payload);
        return;
      }
      console.info('[VoiceToolTrace:UI]', stage, payload);
    },
    []
  );

  const updateVoiceStatus = useCallback((status: VoiceSessionStatus) => {
    voiceStatusRef.current = status;
    setVoiceStatus(status);
  }, []);

  const voiceStatusLabel = useMemo(() => {
    if (!hasPressedStart) {
      return;
    }
    switch (voiceStatus) {
      case 'idle':
        return 'Idle';
      case 'authorizing':
        return 'Authorizing microphone';
      case 'connecting':
        return 'Connecting to Voice Assistant';
      case 'running':
        return 'Live';
      case 'error':
        return 'Needs attention';
      default:
        return voiceStatus;
    }
  }, [voiceStatus]);

  const isSessionActive =
    voiceStatus === 'running' ||
    voiceStatus === 'connecting' ||
    voiceStatus === 'authorizing';

  const showOpenDashboardInNewTab = useMemo(() => {
    if (!voiceError) {
      return false;
    }
    if (voiceError.includes('Microphone is blocked while embedded')) {
      return true;
    }
    if (!isEmbeddedInIframe()) {
      return false;
    }
    return /microphone|media stream|voice/i.test(voiceError);
  }, [voiceError]);

  const openDashboardInNewTab = useCallback(() => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  }, []);

  const clearVisualization = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
  }, []);

  const renderWaveform = useCallback(
    (canvas: HTMLCanvasElement, values: Float32Array, color: string) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) {
        return;
      }
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      WavRenderer.drawBars(canvas, ctx, values, color, 24, 2, 2, true);
    },
    []
  );

  const startVisualization = useCallback(() => {
    clearVisualization();
    const draw = () => {
      if (voiceStatusRef.current !== 'running') {
        animationRef.current = undefined;
        return;
      }
      try {
        const inputCanvas = inputCanvasRef.current;
        if (inputCanvas && recorderRef.current) {
          const frequencies = recorderRef.current.getFrequencies('voice');
          renderWaveform(inputCanvas, frequencies.values, COLORS.electricBlue);
        }
      } catch (err) {
        if (!recorderRef.current) {
          animationRef.current = undefined;
          return;
        }
      }
      try {
        const outputCanvas = outputCanvasRef.current;
        if (outputCanvas && playerRef.current) {
          const frequencies = playerRef.current.getFrequencies('voice');
          renderWaveform(outputCanvas, frequencies.values, COLORS.successGreen);
        }
      } catch (err) {
        if (!playerRef.current) {
          animationRef.current = undefined;
          return;
        }
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    animationRef.current = requestAnimationFrame(draw);
  }, [clearVisualization, renderWaveform]);

  const clearEventHandlers = useCallback(() => {
    if (!clientRef.current) {
      handlerRefs.current = [];
      return;
    }
    for (const { event, handler } of handlerRefs.current) {
      try {
        clientRef.current.off(event, handler);
      } catch (err) {
        console.warn(`Failed detaching event "${event}"`, err);
      }
    }
    handlerRefs.current = [];
  }, []);

  const teardownVoiceSession = useCallback(
    async ({ resetStatus } = { resetStatus: true }) => {
      clearVisualization();
      clearEventHandlers();
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (err) {
          console.warn('Failed to disconnect realtime client', err);
        }
        clientRef.current = null;
      }
      if (playerRef.current?.context) {
        try {
          await playerRef.current.context.close();
        } catch (err) {
          console.warn('Failed to close audio output context', err);
        }
      }
      playerRef.current = null;
      if (recorderRef.current) {
        try {
          await recorderRef.current.quit();
        } catch (err) {
          console.warn('Failed to stop recorder', err);
        }
        recorderRef.current = null;
      }
      if (resetStatus) {
        setVoiceError(null);
        updateVoiceStatus('idle');
      }
    },
    [clearEventHandlers, clearVisualization, updateVoiceStatus]
  );

  const applyMapLocation = useCallback(
    ({
      lat,
      lng,
      location,
    }: {
      lat: number;
      lng: number;
      location?: string;
    }) => {
      logToolTrace({
        stage: 'ui.apply_map_location',
        details: { lat, lng, location: location ?? null },
      });
      onMapPositionChange({ lat, lng });
      onMarkerUpdate({
        lat,
        lng,
        location:
          typeof location === 'string' && location.trim().length
            ? location.trim()
            : undefined,
      });
    },
    [logToolTrace, onMapPositionChange, onMarkerUpdate]
  );

  const flyToPlace = useCallback(
    async ({ place }: { place: string }) => {
      const trimmedPlace = place.trim();
      logToolTrace({
        stage: 'ui.fly_to_place.received',
        details: { place: trimmedPlace || null },
      });
      if (!trimmedPlace) {
        logToolTrace({
          stage: 'ui.fly_to_place.rejected',
          level: 'warn',
          details: { reason: 'missing_place' },
        });
        throw new Error('The "place" parameter must be a non-empty string.');
      }

      const result = await lookupBoundingBoxForPlace(trimmedPlace);
      const fallbackCenter = {
        lat: (result.boundingBox.north + result.boundingBox.south) / 2,
        lng: (result.boundingBox.east + result.boundingBox.west) / 2,
      };
      const resolvedCenter = result.center
        ? { lat: result.center.lat, lng: result.center.lon }
        : fallbackCenter;

      applyMapLocation({
        lat: resolvedCenter.lat,
        lng: resolvedCenter.lng,
        location: result.displayName,
      });
      logToolTrace({
        stage: 'ui.fly_to_place.applied',
        details: {
          input_place: trimmedPlace,
          resolved_location: result.displayName,
          lat: resolvedCenter.lat,
          lng: resolvedCenter.lng,
        },
      });

      return {
        success: true,
        location: result.displayName,
        latitude: resolvedCenter.lat,
        longitude: resolvedCenter.lng,
        bounding_box: result.boundingBox,
      };
    },
    [applyMapLocation, logToolTrace]
  );

  const applyObservationDateRange = useCallback(
    ({
      startInput,
      endInput,
    }: {
      startInput: unknown;
      endInput: unknown;
    }) => {
      logToolTrace({
        stage: 'ui.apply_date_range.received',
        details: {
          start_input: formatUnknownForLog(startInput),
          end_input: formatUnknownForLog(endInput),
        },
      });
      const startDate = parseFlexibleDateArg({
        value: startInput,
        label: 'start_date',
      });
      const endDate = parseFlexibleDateArg({
        value: endInput,
        label: 'end_date',
      });

      if (endDate < startDate) {
        logToolTrace({
          stage: 'ui.apply_date_range.rejected',
          level: 'warn',
          details: {
            reason: 'end_before_start',
            start_date: formatDateForResponse(startDate),
            end_date: formatDateForResponse(endDate),
          },
        });
        throw new Error('end_date must be on or after start_date.');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (endDate > today) {
        logToolTrace({
          stage: 'ui.apply_date_range.rejected',
          level: 'warn',
          details: {
            reason: 'end_in_future',
            end_date: formatDateForResponse(endDate),
          },
        });
        throw new Error('end_date cannot be in the future.');
      }

      onDateRangeChange({ startDate, endDate });
      logToolTrace({
        stage: 'ui.apply_date_range.applied',
        details: {
          start_date: formatDateForResponse(startDate),
          end_date: formatDateForResponse(endDate),
        },
      });

      return {
        start_date: formatDateForResponse(startDate),
        end_date: formatDateForResponse(endDate),
        total_days:
          Math.floor(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1,
      };
    },
    [logToolTrace, onDateRangeChange]
  );

  const configureClientTools = useCallback(
    (client: RealtimeClient) => {
      client.clearTools();

      client.addTool(
        APPLY_MAP_LOCATION_TOOL_DEFINITION,
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lat', 'latitude'],
            }),
            'lat'
          );
          const longitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lng', 'longitude', 'lon'],
            }),
            'lng'
          );
          const locationLabel = getStringToolArg({
            args,
            keys: ['location', 'place'],
          });
          applyMapLocation({
            lat: latitude,
            lng: longitude,
            location: locationLabel ?? undefined,
          });
          return {
            success: true,
            latitude,
            longitude,
            location: locationLabel ?? null,
          };
        }
      );

      client.addTool(
        APPLY_DATE_RANGE_TOOL_DEFINITION,
        async (args: Record<string, any>) => {
          const { startInput, endInput } = getDateRangeInputs({ args });
          const result = applyObservationDateRange({
            startInput,
            endInput,
          });
          return {
            success: true,
            ...result,
          };
        }
      );

      client.addTool(
        FLY_TO_PLACE_TOOL_DEFINITION,
        async (args: Record<string, any>) => {
          const place = getPlaceFromToolArgs({ args });
          return flyToPlace({ place: place ?? '' });
        }
      );

      client.addTool(
        {
          name: 'set_map_location',
          description:
            'Sets the map location from a city, region, country, or landmark name.',
          parameters: {
            type: 'object',
            properties: {
              place: {
                type: 'string',
                description:
                  'Place name for map navigation, such as "Chile", "Austin", or "Sydney".',
              },
              location: {
                type: 'string',
                description: 'Alternate place field.',
              },
              destination: {
                type: 'string',
                description: 'Alternate place field.',
              },
              query: {
                type: 'string',
                description: 'Alternate place field.',
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const place = getPlaceFromToolArgs({ args });
          return flyToPlace({ place: place ?? '' });
        }
      );

      client.addTool(
        {
          name: 'lookup_bounding_box',
          description:
            'Resolves a place name to a geographic bounding box using OpenStreetMap Nominatim. For navigation, use fly_to_place instead.',
          parameters: {
            type: 'object',
            required: ['place'],
            properties: {
              place: {
                type: 'string',
                description:
                  'City, region, or country name to geocode (e.g., "Lisbon", "Peru").',
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const place =
            typeof args?.place === 'string' ? args.place.trim() : '';
          if (!place) {
            throw new Error(
              'The "place" parameter must be a non-empty string.'
            );
          }
          const result = await lookupBoundingBoxForPlace(place);
          return {
            bounding_box: result.boundingBox,
            display_name: result.displayName,
            center: result.center,
            source: result.source,
          };
        }
      );

      client.addTool(
        {
          name: 'get_observations',
          description:
            'Counts cached wildfire observations that fall within a latitude/longitude bounding box.',
          parameters: {
            type: 'object',
            required: ['bounding_box'],
            properties: {
              bounding_box: {
                type: 'object',
                description:
                  'Rectangular bounds with north/south latitude and east/west longitude edges.',
                properties: {
                  north: {
                    type: 'number',
                    description: 'Northern latitude edge',
                  },
                  south: {
                    type: 'number',
                    description: 'Southern latitude edge',
                  },
                  east: {
                    type: 'number',
                    description: 'Eastern longitude edge',
                  },
                  west: {
                    type: 'number',
                    description: 'Western longitude edge',
                  },
                },
                required: ['north', 'south', 'east', 'west'],
                additionalProperties: false,
              },
              label: {
                type: 'string',
                description:
                  'Optional descriptor for the bounding box (e.g., the place name used to generate it).',
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const bounds = parseBoundingBoxArg(args?.bounding_box);
          const label =
            typeof args?.label === 'string' && args.label.trim().length
              ? args.label.trim()
              : undefined;
          const stats = await countObservationsInBoundingBox(bounds);
          const summary = summarizeBoundingBox(bounds, label);
          onObservationQueryChange(summary);
          onObservationValueChange(stats);
          return {
            ...stats,
            value: stats.count,
            bounding_box: bounds,
            label,
          };
        }
      );

      client.addTool(
        {
          name: 'set_observation_date_range',
          description:
            'Updates the wildfire observation date range shown in the dashboard. Prefer YYYY-MM-DD values but natural language dates are also accepted.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description:
                  'Inclusive start date in YYYY-MM-DD format (e.g., 2025-01-06).',
              },
              end_date: {
                type: 'string',
                description:
                  'Inclusive end date in YYYY-MM-DD format (e.g., 2025-01-10).',
              },
              start: {
                type: 'string',
                description: 'Alternate key for start date.',
              },
              end: {
                type: 'string',
                description: 'Alternate key for end date.',
              },
              startDate: {
                type: 'string',
                description: 'Alternate key for start date.',
              },
              endDate: {
                type: 'string',
                description: 'Alternate key for end date.',
              },
              from: {
                type: 'string',
                description: 'Alternate key for start date.',
              },
              to: {
                type: 'string',
                description: 'Alternate key for end date.',
              },
              range: {
                type: 'string',
                description:
                  'Single string range, such as "2025-01-06 to 2025-01-08" or "January 6 - January 8".',
              },
              timeframe: {
                type: 'string',
                description: 'Alternate single string date range.',
              },
              date_range: {
                type: 'object',
                description:
                  'Nested date range object. Can contain start/end style keys.',
                additionalProperties: true,
              },
              dateRange: {
                type: 'object',
                description:
                  'Nested date range object. Can contain start/end style keys.',
                additionalProperties: true,
              },
              dates: {
                type: 'object',
                description:
                  'Nested dates object. Can contain start/end style keys.',
                additionalProperties: true,
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const { startInput, endInput } = getDateRangeInputs({ args });
          return applyObservationDateRange({
            startInput,
            endInput,
          });
        }
      );

      client.addTool(
        {
          name: 'control_dashboard_interactivity',
          description:
            'Handles UI interactivity requests. Use this for changing map location and/or wildfire date range in one call.',
          parameters: {
            type: 'object',
            properties: {
              place: { type: 'string', description: 'Location to move the map to.' },
              location: {
                type: 'string',
                description: 'Alternate place field.',
              },
              destination: {
                type: 'string',
                description: 'Alternate place field.',
              },
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' },
              latitude: { type: 'number', description: 'Alternate latitude field' },
              longitude: {
                type: 'number',
                description: 'Alternate longitude field',
              },
              lon: { type: 'number', description: 'Alternate longitude field' },
              start_date: { type: 'string', description: 'Start date value.' },
              end_date: { type: 'string', description: 'End date value.' },
              start: { type: 'string', description: 'Alternate start date value.' },
              end: { type: 'string', description: 'Alternate end date value.' },
              startDate: {
                type: 'string',
                description: 'Alternate start date value.',
              },
              endDate: {
                type: 'string',
                description: 'Alternate end date value.',
              },
              from: { type: 'string', description: 'Alternate start date value.' },
              to: { type: 'string', description: 'Alternate end date value.' },
              range: { type: 'string', description: 'Combined date range string.' },
              timeframe: {
                type: 'string',
                description: 'Alternate combined date range string.',
              },
              date_range: {
                type: 'object',
                description: 'Nested date range object.',
                additionalProperties: true,
              },
              dateRange: {
                type: 'object',
                description: 'Nested date range object.',
                additionalProperties: true,
              },
              dates: {
                type: 'object',
                description: 'Nested dates object.',
                additionalProperties: true,
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const results: Record<string, unknown> = {};

          const place = getPlaceFromToolArgs({ args });
          const latitudeRaw = getToolArgValue({
            args,
            keys: ['lat', 'latitude'],
          });
          const longitudeRaw = getToolArgValue({
            args,
            keys: ['lng', 'longitude', 'lon'],
          });
          const hasCoordinates =
            latitudeRaw !== undefined || longitudeRaw !== undefined;
          const hasDateHints =
            getToolArgValue({
              args,
              keys: [
                'start_date',
                'startDate',
                'start',
                'from',
                'end_date',
                'endDate',
                'end',
                'to',
                'range',
                'timeframe',
                'date_range',
                'dateRange',
                'dates',
              ],
            }) !== undefined;

          if (place) {
            results.map = await flyToPlace({ place });
          } else if (hasCoordinates) {
            if (latitudeRaw === undefined || longitudeRaw === undefined) {
              throw new Error(
                'Both latitude and longitude are required when using map coordinates.'
              );
            }
            const latitude = ensureNumber(latitudeRaw, 'lat');
            const longitude = ensureNumber(longitudeRaw, 'lng');
            const locationLabel = getStringToolArg({
              args,
              keys: ['location', 'place', 'destination'],
            });
            applyMapLocation({
              lat: latitude,
              lng: longitude,
              location: locationLabel ?? undefined,
            });
            results.map = {
              latitude,
              longitude,
              location: locationLabel ?? null,
            };
          }

          if (hasDateHints) {
            const { startInput, endInput } = getDateRangeInputs({ args });
            results.date_range = applyObservationDateRange({
              startInput,
              endInput,
            });
          }

          if (!Object.keys(results).length) {
            throw new Error(
              'No interactive update data provided. Include a place, coordinates, or date range values.'
            );
          }

          return {
            success: true,
            ...results,
          };
        }
      );

      client.addTool(
        {
          name: 'get_weather',
          description:
            'Retrieves current temperature and wind speed for the given coordinates. Provide a descriptive label for the location.',
          parameters: {
            type: 'object',
            properties: {
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' },
              latitude: { type: 'number', description: 'Alternate latitude field' },
              longitude: {
                type: 'number',
                description: 'Alternate longitude field',
              },
              lon: { type: 'number', description: 'Alternate longitude field' },
              location: {
                type: 'string',
                description: 'Label for the location',
              },
              place: {
                type: 'string',
                description: 'Optional place label if location is omitted.',
              },
            },
            required: ['lat', 'lng'],
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lat', 'latitude'],
            }),
            'lat'
          );
          const longitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lng', 'longitude', 'lon'],
            }),
            'lng'
          );
          const location = args?.location ?? args?.place;
          const label =
            typeof location === 'string' && location.trim().length
              ? location.trim()
              : 'Selected location';

          applyMapLocation({
            lat: latitude,
            lng: longitude,
            location: label,
          });

          const url = `${OPEN_METEO_FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Weather request failed with status ${response.status}.`
            );
          }
          const json = await response.json();

          const temperatureReading =
            typeof json?.current?.temperature_2m === 'number' &&
              typeof json?.current_units?.temperature_2m === 'string'
              ? {
                value: json.current.temperature_2m,
                units: json.current_units.temperature_2m,
              }
              : null;

          const windReading =
            typeof json?.current?.wind_speed_10m === 'number' &&
              typeof json?.current_units?.wind_speed_10m === 'string'
              ? {
                value: json.current.wind_speed_10m,
                units: json.current_units.wind_speed_10m,
              }
              : null;

          onMarkerUpdate({
            lat: latitude,
            lng: longitude,
            location: label,
            temperature: temperatureReading,
            wind_speed: windReading,
          });

          return {
            latitude,
            longitude,
            location: label,
            temperature: temperatureReading,
            wind_speed: windReading,
          };
        }
      );

      client.addTool(
        {
          name: 'get_last_rain',
          description:
            'Returns the number of days since measurable rain occurred at the provided coordinates. Responds with -1 when it has been more than 10 days.',
          parameters: {
            type: 'object',
            properties: {
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' },
              latitude: { type: 'number', description: 'Alternate latitude field' },
              longitude: {
                type: 'number',
                description: 'Alternate longitude field',
              },
              lon: { type: 'number', description: 'Alternate longitude field' },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lat', 'latitude'],
            }),
            'lat'
          );
          const longitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lng', 'longitude', 'lon'],
            }),
            'lng'
          );

          onMapPositionChange({ lat: latitude, lng: longitude });

          const now = new Date();
          const endDate = now.toISOString().split('T')[0];
          const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

          const url = `${OPEN_METEO_ARCHIVE_URL}?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Rainfall request failed with status ${response.status}.`
            );
          }
          const json = await response.json();

          const precipitation: number[] = Array.isArray(
            json?.daily?.precipitation_sum
          )
            ? json.daily.precipitation_sum.map((value: unknown) =>
              Number(value)
            )
            : [];
          const timestamps: string[] = Array.isArray(json?.daily?.time)
            ? json.daily.time
            : [];

          let daysSinceRain: number | null = null;
          const today = new Date();
          for (let index = precipitation.length - 1; index >= 0; index -= 1) {
            const amount = precipitation[index];
            if (Number.isFinite(amount) && amount > 0) {
              const dateString = timestamps[index];
              if (dateString) {
                const rainDate = new Date(dateString);
                const diffMs = today.getTime() - rainDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                daysSinceRain = diffDays > 10 ? -1 : diffDays;
              }
              break;
            }
          }

          if (daysSinceRain === null) {
            daysSinceRain = -1;
          }

          onMarkerUpdate({
            lat: latitude,
            lng: longitude,
            daysSinceRain,
          });

          return {
            latitude,
            longitude,
            days_since_rain: daysSinceRain,
          };
        }
      );

      client.addTool(
        {
          name: 'map_fly_to',
          description:
            'Centers the wildfire map. Use lat/lng when available, or provide "place" to geocode and fly.',
          parameters: {
            type: 'object',
            properties: {
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' },
              latitude: { type: 'number', description: 'Alternate latitude field' },
              longitude: {
                type: 'number',
                description: 'Alternate longitude field',
              },
              lon: { type: 'number', description: 'Alternate longitude field' },
              place: {
                type: 'string',
                description: 'Optional place name used when coordinates are unavailable.',
              },
              location: {
                type: 'string',
                description: 'Optional label for the map marker',
              },
              destination: {
                type: 'string',
                description: 'Alternate place name field for map navigation.',
              },
              query: {
                type: 'string',
                description: 'Alternate place name field for map navigation.',
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const place = getPlaceFromToolArgs({ args });
          if (place) {
            return flyToPlace({ place });
          }

          const latitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lat', 'latitude'],
            }),
            'lat'
          );
          const longitude = ensureNumber(
            getToolArgValue({
              args,
              keys: ['lng', 'longitude', 'lon'],
            }),
            'lng'
          );
          const location: string | undefined =
            typeof args?.location === 'string' ? args.location : undefined;

          applyMapLocation({
            lat: latitude,
            lng: longitude,
            location:
              typeof location === 'string' && location.trim().length
                ? location.trim()
                : undefined,
          });

          return { latitude, longitude, location: location ?? null };
        }
      );
    },
    [
      applyObservationDateRange,
      applyMapLocation,
      flyToPlace,
      onObservationQueryChange,
      onObservationValueChange,
    ]
  );

  const fetchRelaySession = useCallback(async () => {
    const requestedTools = buildRequiredInteractivityToolDefinitions();
    const requestedSessionConfig: Partial<SessionConfig> = {
      instructions: INTERACTIVITY_TOOL_CALL_RULES,
      tool_choice: 'auto',
      tools: requestedTools,
    };
    logToolTrace({
      stage: 'relay.session.request_start',
      details: {
        tool_names: requestedTools.map((tool) => tool.name),
      },
    });
    const response = await fetch(VOICE_RELAY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionConfig: requestedSessionConfig,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Relay request failed (${response.status}): ${errorText}`.trim()
      );
    }
    const session = (await response.json()) as GrowRelaySession & {
      expiresAt: unknown;
    };
    const normalizedSession: GrowRelaySession = {
      ...session,
      expiresAt: normalizeExpirationTimestamp(session.expiresAt),
    };
    logToolTrace({
      stage: 'relay.session.request_success',
      details: {
        websocket_url: normalizedSession.websocketUrl,
        expires_at: normalizedSession.expiresAt,
        tool_names: Array.isArray(normalizedSession.session?.tools)
          ? normalizedSession.session.tools
            .map((tool) =>
              typeof tool === 'object' && tool !== null && 'name' in tool
                ? (tool as { name?: unknown }).name
                : null
            )
            .filter((name) => typeof name === 'string')
          : [],
      },
    });
    return normalizedSession;
  }, [logToolTrace]);

  const stopVoiceSession = useCallback(async () => {
    await teardownVoiceSession();
  }, [teardownVoiceSession]);

  const startVoiceSession = useCallback(async () => {
    if (
      voiceStatusRef.current === 'running' ||
      voiceStatusRef.current === 'connecting' ||
      voiceStatusRef.current === 'authorizing'
    ) {
      return;
    }
    setHasPressedStart(true);
    setVoiceError(null);
    updateVoiceStatus('authorizing');

    const recorder = new WavRecorder({ sampleRate: 24_000 });
    recorderRef.current = recorder;
    try {
      await recorder.begin();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied. Please allow microphone access.'
      );
      updateVoiceStatus('error');
      return;
    }

    const player = new WavStreamPlayer({ sampleRate: 24_000 });
    playerRef.current = player;
    try {
      await player.connect();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Unable to prepare audio output. Please try again.'
      );
      updateVoiceStatus('error');
      return;
    }

    let relaySession: GrowRelaySession;
    try {
      let candidate: GrowRelaySession | null = null;
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const session = await fetchRelaySession();
        const expired = hasExpirationElapsed(
          session.expiresAt,
          RELAY_SESSION_EXPIRY_BUFFER_MS
        );
        if (!expired) {
          candidate = session;
          break;
        }
      }
      if (!candidate) {
        throw new Error('Voice relay session expired before it could be used.');
      }
      relaySession = candidate;
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      console.error('Failed to authorize voice session', err);
      setVoiceError(
        'Unable to authorize voice session. Please try again later.'
      );
      updateVoiceStatus('error');
      return;
    }

    const relaySessionConfig = extractRelaySessionConfig(relaySession.session);
    const sessionConfig: Partial<SessionConfig> = {
      ...relaySessionConfig,
      instructions: mergeSessionInstructions({
        baseInstructions: relaySessionConfig.instructions,
        appendedInstructions: INTERACTIVITY_TOOL_CALL_RULES,
      }),
      tool_choice: 'auto',
    };
    logToolTrace({
      stage: 'voice.session.config_prepared',
      details: {
        tool_choice: sessionConfig.tool_choice,
        has_instructions: Boolean(sessionConfig.instructions),
        tool_names: sessionConfig.tools?.map((tool) => tool.name) ?? [],
      },
    });
    const clientSecret =
      typeof relaySession.clientSecret === 'string'
        ? relaySession.clientSecret.trim()
        : '';
    const websocketUrl =
      typeof relaySession.websocketUrl === 'string'
        ? relaySession.websocketUrl.trim()
        : '';

    if (!clientSecret || !websocketUrl) {
      await teardownVoiceSession({ resetStatus: false });
      console.error('Voice relay returned an invalid session payload');
      setVoiceError(
        'Voice relay returned an invalid session. Please try again later.'
      );
      updateVoiceStatus('error');
      return;
    }

    const client = new RealtimeClient({
      url: websocketUrl,
      apiKey: clientSecret,
    });
    logToolTrace({
      stage: 'voice.session.client_created',
      details: {
        websocket_url: websocketUrl,
      },
    });
    clientRef.current = client;
    if (Object.keys(sessionConfig).length > 0) {
      client.updateSession(sessionConfig);
    }
    configureClientTools(client);

    const registerHandler = (
      eventName: string,
      handler: (event: any) => void
    ) => {
      client.on(eventName, handler);
      handlerRefs.current.push({ event: eventName, handler });
    };

    const audioPlaybackOffsets = new Map<string, number>();

    registerHandler('realtime.event', (event: RealtimeLogEntry) => {
      setRealtimeEvents((prev) => {
        const next = prev.concat(event);
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
      const eventType =
        typeof event?.event?.type === 'string' ? event.event.type : '';
      const shouldLogRealtimeEvent =
        eventType.includes('function_call') ||
        eventType === 'session.update' ||
        eventType === 'session.created' ||
        eventType === 'response.create' ||
        eventType === 'response.output_item.created' ||
        eventType === 'response.output_item.added' ||
        eventType === 'response.output_item.done' ||
        eventType === 'conversation.item.create' ||
        eventType === 'conversation.item.done' ||
        eventType === 'conversation.item.created';
      if (shouldLogRealtimeEvent) {
        const rawEvent = event.event as Record<string, unknown>;
        const item =
          rawEvent.item &&
            typeof rawEvent.item === 'object' &&
            !Array.isArray(rawEvent.item)
            ? (rawEvent.item as Record<string, unknown>)
            : null;
        logToolTrace({
          stage: 'voice.realtime_event',
          details: {
            source: event.source,
            type: eventType,
            item_type: item?.type ?? null,
            item_status: item?.status ?? null,
            item_name: item?.name ?? null,
            item_call_id: item?.call_id ?? null,
            call_id: typeof rawEvent.call_id === 'string' ? rawEvent.call_id : null,
            item_id: typeof rawEvent.item_id === 'string' ? rawEvent.item_id : null,
          },
        });
      }
    });

    registerHandler('conversation.updated', ({ item, delta }) => {
      setConversationItems(client.conversation.getItems());
      if (
        !item ||
        item.role !== 'assistant' ||
        !delta ||
        !('audio' in delta) ||
        !(delta.audio instanceof Int16Array) ||
        delta.audio.length === 0
      ) {
        return;
      }
      try {
        player.add16BitPCM(delta.audio, item.id);
        const playedSamples = audioPlaybackOffsets.get(item.id) ?? 0;
        audioPlaybackOffsets.set(item.id, playedSamples + delta.audio.length);
      } catch (err) {
        console.warn('Failed to stream assistant audio delta', err);
      }
    });

    registerHandler('conversation.item.completed', ({ item }) => {
      if (
        !item ||
        item.role !== 'assistant' ||
        !item.formatted ||
        !(item.formatted.audio instanceof Int16Array) ||
        item.formatted.audio.length === 0
      ) {
        return;
      }
      const playedSamples = audioPlaybackOffsets.get(item.id) ?? 0;
      if (playedSamples >= item.formatted.audio.length) {
        return;
      }
      try {
        const remaining = item.formatted.audio.slice(playedSamples);
        if (remaining.length > 0) {
          player.add16BitPCM(remaining, item.id);
          audioPlaybackOffsets.set(item.id, playedSamples + remaining.length);
        }
      } catch (err) {
        console.warn('Failed to stream remaining assistant audio', err);
      }
    });

    registerHandler('conversation.interrupted', () => {
      Promise.resolve(player.interrupt()).catch((err: unknown) =>
        console.warn('Failed to interrupt playback', err)
      );
    });

    updateVoiceStatus('connecting');
    try {
      await client.connect();
      await client.waitForSessionCreated();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to the voice relay.'
      );
      updateVoiceStatus('error');
      return;
    }

    setConversationItems(client.conversation.getItems());
    setRealtimeEvents([]);

    try {
      await recorder.record((chunk) => {
        if (!clientRef.current?.isConnected()) {
          return;
        }
        try {
          const mono = new Int16Array(chunk.mono);
          clientRef.current.appendInputAudio(mono);
        } catch (err) {
          console.warn('Failed to forward audio chunk', err);
        }
      }, 4800);
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Unable to start microphone stream. Please try again.'
      );
      updateVoiceStatus('error');
      return;
    }

    updateVoiceStatus('running');
    startVisualization();
  }, [
    configureClientTools,
    fetchRelaySession,
    logToolTrace,
    startVisualization,
    teardownVoiceSession,
    updateVoiceStatus,
  ]);

  const resetConversation = useCallback(() => {
    clientRef.current?.conversation.clear();
    setConversationItems([]);
    setRealtimeEvents([]);
    onResetContext();
  }, [onResetContext]);

  useEffect(() => {
    return () => {
      teardownVoiceSession({ resetStatus: false }).catch((err) =>
        console.warn('Error during voice session teardown', err)
      );
    };
  }, [teardownVoiceSession]);

  useEffect(() => {
    if (
      expandedEventIndex !== null &&
      expandedEventIndex >= realtimeEvents.length
    ) {
      setExpandedEventIndex(null);
    }
  }, [expandedEventIndex, realtimeEvents.length]);

  const shouldShowTopVoiceModal = Boolean(isSessionActive && voiceStatusLabel);

  const topVoiceModal = shouldShowTopVoiceModal ? (
    <div className="top-voice-data-modal" data-component="TopVoiceDataModal">
      <div className="top-voice-data-modal__header">
        <div className="top-voice-data-modal__status" aria-live="polite">
          {voiceStatus === 'running' ? (
            <span
              className="top-voice-data-modal__status-dot"
              aria-hidden="true"
            />
          ) : (
            <Spinner size={14} />
          )}
          <span>{voiceStatusLabel}</span>
        </div>
        <span className="top-voice-data-modal__hint">
          {voiceStatus === 'running' ? null : 'Connecting…'}
        </span>
      </div>
      {voiceStatus === 'running' ? (
        <div className="realtime-voice-modal__visualization">
          <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--client">
            <span>Mic</span>
            <canvas ref={inputCanvasRef} />
          </div>
          <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--server">
            <span>AI</span>
            <canvas ref={outputCanvasRef} />
          </div>
        </div>
      ) : (
        <div className="top-voice-data-modal__message">
          <Spinner size={18} />
          <span>Preparing your voice session…</span>
        </div>
      )}
    </div>
  ) : null;

  const bottomVoiceModal = (
    <div className="realtime-voice-modal" data-component="RealtimeVoiceModal">
      <div className="realtime-voice-modal__header">
        <div className="realtime-voice-modal__status">
          <span className="realtime-voice-modal__title">Voice Assistant</span>
        </div>
        <div className="realtime-voice-modal__controls">
          {voiceStatus === 'running' ? (
            <Button
              icon={Square}
              label="Stop"
              buttonStyle="alert"
              disabled={voiceStatus !== 'running'}
              onClick={stopVoiceSession}
            />
          ) : (
            <div className="realtime-voice-modal__start-wrapper">
              {!hasPressedStart && !isSessionActive && (
                <div
                  className="realtime-voice-modal__start-arrow"
                  aria-hidden="true"
                >
                  <span className="realtime-voice-modal__start-arrow-icon">
                    →
                  </span>
                </div>
              )}
              <Button
                icon={Mic}
                label={isSessionActive ? 'Starting…' : 'START'}
                className="realtime-voice-modal__start-button"
                disabled={isSessionActive}
                onClick={startVoiceSession}
              />
            </div>
          )}
          {(isSessionActive ||
            !!realtimeEvents.length ||
            !!conversationItems.length) && (
              <Button
                icon={RefreshCw}
                label="Reset"
                iconColor={'white'}
                textStyle={{ color: COLORS.white }}
                buttonStyle="flush"
                disabled={!conversationItems.length && !realtimeEvents.length}
                onClick={resetConversation}
              />
            )}
        </div>
      </div>
      {voiceError && (
        <div className="realtime-voice-modal__error">
          <div className="realtime-voice-modal__error-main">
            <AlertTriangle size={16} aria-hidden />
            <span>{voiceError}</span>
          </div>
          {showOpenDashboardInNewTab ? (
            <Button
              type="button"
              icon={ExternalLink}
              label="Open dashboard in new tab"
              buttonStyle="action"
              className="realtime-voice-modal__error-action"
              onClick={openDashboardInNewTab}
            />
          ) : null}
        </div>
      )}
      {isLargeScreen && (
        <div
          className="realtime-voice-modal__starters"
          aria-live="polite"
          data-testid="conversation-starters"
        >
          <span className="realtime-voice-modal__starters-title">
            Try saying...
          </span>
          <ul className="realtime-voice-modal__starters-list">
            {CONVERSATION_STARTERS.map((starter) => (
              <p key={starter}>{starter}</p>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`realtime-voice-modal-stack${shouldShowTopVoiceModal ? ' realtime-voice-modal-stack--active' : ''
        }`}
      data-component="RealtimeVoiceModalStack"
    >
      {topVoiceModal}
      {bottomVoiceModal}
    </div>
  );
}

function ensureNumber(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${label} value: ${value}`);
  }
  return numeric;
}

function prettyPrintMaybeJson(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch (_error) {
    return input;
  }
}
