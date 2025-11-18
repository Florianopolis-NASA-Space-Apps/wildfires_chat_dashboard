import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Mic, RefreshCw, Square, X } from 'react-feather';
import { Button } from '../button/Button';
import { Spinner } from '../spinner/Spinner';
import { WavRecorder, WavStreamPlayer } from '../../lib/wavtools';
import { WavRenderer } from '../../utils/wav_renderer';
import {
  RealtimeClient,
  type SessionConfig,
} from '../../lib/realtime/RealtimeClient';
import { instructions } from '../../constants/prompts';
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

const PROD_BASE_URL = 'https://api.landscapesupply.app';
const DEV_BASE_URL = 'http://localhost:3000';
const VOICE_RELAY_ENDPOINT = `${PROD_BASE_URL}/api/grow/relay`;
const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2025-08-28';
const RELAY_SESSION_EXPIRY_BUFFER_MS = 5_000;

type GrowRelaySession = {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
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
  event: { type?: string; [key: string]: unknown };
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

function hasExpirationElapsed(
  expiresAt: number | null,
  bufferMs: number = 0
): boolean {
  if (expiresAt === null) {
    return false;
  }
  return Date.now() >= expiresAt - bufferMs;
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

  const configureClientTools = useCallback(
    (client: RealtimeClient) => {
      client.clearTools();

      // UNIFIED FAST NAVIGATION TOOL - combines geocoding + map navigation
      client.addTool(
        {
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
          
          // Geocode and navigate in one operation
          const result = await lookupBoundingBoxForPlace(place);
          const center = result.center;
          
          if (center) {
            // Immediately update map position
            onMapPositionChange({ lat: center.lat, lng: center.lon });
            onMarkerUpdate({
              lat: center.lat,
              lng: center.lon,
              location: result.displayName,
            });
          }
          
          return {
            success: true,
            location: result.displayName,
            latitude: center?.lat ?? null,
            longitude: center?.lon ?? null,
            bounding_box: result.boundingBox,
          };
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
            'Updates the wildfire observation date range shown in the dashboard. Use this when the user specifies a start and end date.',
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
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const startDate = parseDateArg(args?.start_date, 'start_date');
          const endDate = parseDateArg(args?.end_date, 'end_date');

          if (endDate < startDate) {
            throw new Error('end_date must be on or after start_date.');
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (endDate > today) {
            throw new Error('end_date cannot be in the future.');
          }

          onDateRangeChange({ startDate, endDate });

          return {
            start_date: formatDateForResponse(startDate),
            end_date: formatDateForResponse(endDate),
            total_days:
              Math.floor(
                (endDate.getTime() - startDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1,
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
              location: {
                type: 'string',
                description: 'Label for the location',
              },
            },
            required: ['lat', 'lng', 'location'],
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(args?.lat, 'lat');
          const longitude = ensureNumber(args?.lng, 'lng');
          const location = args?.location;
          const label =
            typeof location === 'string' && location.trim().length
              ? location.trim()
              : 'Selected location';

          onMarkerUpdate({
            lat: latitude,
            lng: longitude,
            location: label,
          });
          onMapPositionChange({ lat: latitude, lng: longitude });

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
            },
            required: ['lat', 'lng'],
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(args?.lat, 'lat');
          const longitude = ensureNumber(args?.lng, 'lng');

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
          description: 'Centers the wildfire map on the provided coordinates.',
          parameters: {
            type: 'object',
            properties: {
              lat: { type: 'number', description: 'Latitude' },
              lng: { type: 'number', description: 'Longitude' },
              location: {
                type: 'string',
                description: 'Optional label for the map marker',
              },
            },
            required: ['lat', 'lng'],
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const latitude = ensureNumber(args?.lat, 'lat');
          const longitude = ensureNumber(args?.lng, 'lng');
          const location: string | undefined =
            typeof args?.location === 'string' ? args.location : undefined;
          onMapPositionChange({ lat: latitude, lng: longitude });
          onMarkerUpdate({
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
      onMarkerUpdate,
      onMapPositionChange,
      onObservationQueryChange,
      onObservationValueChange,
      onDateRangeChange,
    ]
  );

  const fetchRelaySession = useCallback(
    async (sessionConfig: Partial<SessionConfig>) => {
      const response = await fetch(VOICE_RELAY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_REALTIME_MODEL,
          sessionConfig,
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
      return normalizedSession;
    },
    []
  );

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

    const sessionConfig: Partial<SessionConfig> = {
      modalities: ['text', 'audio'],
      instructions,
      voice: 'verse',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
      },
    };

    let relaySession: GrowRelaySession;
    try {
      let candidate: GrowRelaySession | null = null;
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const session = await fetchRelaySession(sessionConfig);
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

    const clientSecret =
      typeof relaySession.clientSecret === 'string'
        ? relaySession.clientSecret.trim()
        : '';
    const websocketUrl =
      typeof relaySession.websocketUrl === 'string'
        ? relaySession.websocketUrl.trim()
        : '';
    const targetModel =
      typeof relaySession.model === 'string' && relaySession.model.trim().length
        ? relaySession.model.trim()
        : DEFAULT_REALTIME_MODEL;

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
      model: targetModel,
    });
    configureClientTools(client);
    clientRef.current = client;

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

    client.updateSession(sessionConfig);

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
          <AlertTriangle size={16} />
          <span>{voiceError}</span>
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
      className={`realtime-voice-modal-stack${
        shouldShowTopVoiceModal ? ' realtime-voice-modal-stack--active' : ''
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
