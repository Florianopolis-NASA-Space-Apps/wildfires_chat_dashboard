import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Mic, RefreshCw, Square, X } from 'react-feather';
import { Button } from '../button/Button';
import { Spinner } from '../spinner/Spinner';
import { WavRecorder, WavStreamPlayer } from '../../lib/wavtools';
import { WavRenderer } from '../../utils/wav_renderer';
import { RealtimeClient } from '../../lib/realtime/RealtimeClient';
import { instructions } from '../../constants/prompts';
import { runObservationScalarQuery } from '../../utils/wildfireDb';
import type { IMapCoords, MapMarkerDetails } from '../mbox/MBox';
import './RealtimeVoiceModal.scss';

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
  onObservationValueChange: (value: number | null) => void;
  onResetContext: () => void;
}

export function RealtimeVoiceModal({
  onMarkerUpdate,
  onMapPositionChange,
  onObservationQueryChange,
  onObservationValueChange,
  onResetContext,
}: RealtimeVoiceModalProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeLogEntry[]>([]);
  const [conversationItems, setConversationItems] = useState<any[]>([]);
  const [expandedEventIndex, setExpandedEventIndex] = useState<number | null>(
    null
  );
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

  const realtimeConfig = useMemo(() => {
    const apiKey = process.env.REACT_APP_OPENAI_API_KEY?.trim();
    const model = 'gpt-realtime-2025-08-28';
    const endpoint = process.env.REACT_APP_OPENAI_REALTIME_URL?.trim();
    return { apiKey, model, endpoint };
  }, []);

  const voiceStatusLabel = useMemo(() => {
    switch (voiceStatus) {
      case 'idle':
        return 'Idle';
      case 'authorizing':
        return 'Authorizing microphone';
      case 'connecting':
        return 'Connecting to OpenAI';
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
          renderWaveform(inputCanvas, frequencies.values, '#0099ff');
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
          renderWaveform(outputCanvas, frequencies.values, '#009900');
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

      client.addTool(
        {
          name: 'get_observations',
          description:
            'Executes a SQL SELECT query over cached wildfire observations and returns a numeric result.',
          parameters: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                type: 'string',
                description:
                  'SQL SELECT statement that returns a single numeric column.',
              },
            },
            additionalProperties: false,
          },
        },
        async (args: Record<string, any>) => {
          const query = typeof args?.query === 'string' ? args.query : '';
          if (query.trim() === '') {
            throw new Error('Query must be a non-empty string.');
          }
          onObservationQueryChange(query);
          const value = await runObservationScalarQuery(query);
          onObservationValueChange(value);
          return { value };
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

          const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m`;
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

          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum`;
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
    ]
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
    if (!realtimeConfig.apiKey) {
      setVoiceError(
        'Missing REACT_APP_OPENAI_API_KEY. Please provide an OpenAI realtime-capable key.'
      );
      updateVoiceStatus('error');
      return;
    }

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

    const client = new RealtimeClient({
      url: realtimeConfig.endpoint,
      apiKey: realtimeConfig.apiKey,
      model: realtimeConfig.model,
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

    client.updateSession({
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
          : 'Failed to connect to the OpenAI realtime API.'
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
    realtimeConfig,
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

  const handleDeleteItem = useCallback((itemId: string) => {
    try {
      clientRef.current?.deleteItem(itemId);
    } catch (err) {
      console.warn(`Failed to delete item ${itemId}`, err);
    }
  }, []);

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

  return (
    <div className="realtime-voice-modal" data-component="RealtimeVoiceModal">
      <div className="realtime-voice-modal__header">
        <div className="realtime-voice-modal__status">
          <span className="realtime-voice-modal__title">Voice Assistant</span>
          <span>{voiceStatusLabel}</span>
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
            <Button
              icon={Mic}
              label={isSessionActive ? 'Starting…' : 'Start'}
              disabled={isSessionActive}
              onClick={startVoiceSession}
            />
          )}
          {isSessionActive && (
            <Button
              icon={RefreshCw}
              label="Reset"
              buttonStyle="flush"
              disabled={!conversationItems.length && !realtimeEvents.length}
              onClick={resetConversation}
            />
          )}
          {isSessionActive &&
            (voiceStatus === 'connecting' || voiceStatus === 'authorizing') && (
              <Spinner size={18} />
            )}
        </div>
      </div>
      {voiceError && (
        <div className="realtime-voice-modal__error">
          <AlertTriangle size={16} />
          <span>{voiceError}</span>
        </div>
      )}

      {!!conversationItems.length &&
        conversationItems.map((item: any) => {
          const roleLabel = (item.role || item.type || 'item') as string;
          const normalizedRole = roleLabel.toLowerCase();
          const transcriptRaw = item?.formatted?.transcript || '';
          const transcript =
            transcriptRaw?.trim() === '' ? '' : transcriptRaw?.trim();
          const textContent = item?.formatted?.text?.trim() || '';
          let message = transcript || textContent || '[audio message]';
          let detail: string | null = null;

          if (item.type === 'function_call' && item.formatted?.tool) {
            message = `Tool call → ${item.formatted.tool.name}`;
            const args = item.formatted.tool.arguments;
            if (typeof args === 'string' && args.trim().length) {
              detail = prettyPrintMaybeJson(args);
            }
          } else if (item.type === 'function_call_output') {
            message = 'Tool result';
            const output =
              typeof item.formatted?.output === 'string'
                ? item.formatted.output
                : typeof item.output === 'string'
                ? item.output
                : '';
            if (output.trim().length) {
              detail = prettyPrintMaybeJson(output);
            }
          }
          return (
            <div className="realtime-voice-modal__body">
              <div className="realtime-voice-modal__conversation">
                <div key={item.id} className="realtime-voice-modal__message">
                  <div
                    className={`realtime-voice-modal__speaker realtime-voice-modal__speaker--${normalizedRole}`}
                  >
                    {roleLabel}
                  </div>
                  <div className="realtime-voice-modal__message-content">
                    <div>{message}</div>
                    {detail && (
                      <pre className="realtime-voice-modal__tool-detail">
                        {detail}
                      </pre>
                    )}
                    {item.status && item.status !== 'completed' && (
                      <div className="realtime-voice-modal__message-status">
                        {item.status}
                      </div>
                    )}
                  </div>
                  <button
                    className="realtime-voice-modal__close"
                    type="button"
                    aria-label={`Remove item ${roleLabel}`}
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    <X />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      <div
        className="realtime-voice-modal__visualization"
        style={{ display: isSessionActive ? undefined : 'none' }}
      >
        <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--client">
          <span>Mic</span>
          <canvas ref={inputCanvasRef} />
        </div>
        <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--server">
          <span>AI</span>
          <canvas ref={outputCanvasRef} />
        </div>
      </div>
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
