/**
 * You can connect directly to OpenAI by setting the following environment variables:
 * Optionally override the websocket endpoint with REACT_APP_OPENAI_REALTIME_URL=
 */

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  X,
  ExternalLink,
  Mic,
  Square,
  RefreshCw,
  AlertTriangle,
} from 'react-feather';
import { Button } from '../components/button/Button';
import './ConsolePage.scss';
import { MBox } from '../components/mbox/MBox';
import { Spinner } from '../components/spinner/Spinner';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools';
import { WavRenderer } from '../utils/wav_renderer';
import { RealtimeClient } from '../lib/realtime/RealtimeClient';
import { instructions } from '../utils/conversation_config';

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

const SLIDE_DECK_LINK =
  'https://docs.google.com/presentation/d/e/2PACX-1vTezgMfwMSMOTV1xAERxRqVY9TMX-bF-45w2v5gP4jbs8Wy1t_H3u5kTwkxNfQFcA/embed?start=false&loop=false&delayms=60000';

export function ConsolePage() {
  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'live' | 'historical'>('historical');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeLogEntry[]>([]);
  const [conversationItems, setConversationItems] = useState<any[]>([]);
  const [expandedEventIndex, setExpandedEventIndex] = useState<number | null>(
    null
  );

  const clientRef = useRef<RealtimeClient | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const playerRef = useRef<WavStreamPlayer | null>(null);
  const animationRef = useRef<number>();
  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlerRefs = useRef<
    Array<{ event: string; handler: (event: any) => void }>
  >([]);
  const voiceStatusRef = useRef<VoiceSessionStatus>('idle');

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

  const formatTime = useCallback((timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch (err) {
      return timestamp;
    }
  }, []);

  const toggleEventDetails = useCallback((index: number) => {
    setExpandedEventIndex((previous) => (previous === index ? null : index));
  }, []);

  // Add this function to close the lightbox
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  /**
   * State to track window width
   */
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isLargeScreen = windowWidth >= 654;
  /**
   * Update window width on resize
   */
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const openSlideDeck = useCallback(() => {
    if (isLargeScreen) {
      setIsLightboxOpen(true);
    } else {
      // open SLIDE_DECK_LINK in new tab
      window.open(SLIDE_DECK_LINK, '_blank');
    }
  }, [isLargeScreen]);

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
        // Ignore visualization errors but stop loop if recorder is disposed
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
    realtimeConfig,
    startVisualization,
    teardownVoiceSession,
    updateVoiceStatus,
  ]);

  const resetConversation = useCallback(() => {
    clientRef.current?.conversation.clear();
    setConversationItems([]);
    setRealtimeEvents([]);
  }, []);

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

  const DatasetControlsSmall = (
    <div
      className={`content-actions`}
      style={{ alignItems: 'center', alignSelf: 'center' }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
      >
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'historical'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'historical' ? 1 : 0.6 }}
          onClick={() => setDataMode('historical')}
        >
          {`HISTORICAL`}
        </button>
        <p
          style={{ fontWeight: dataMode === 'historical' ? 'bold' : 'normal' }}
        >
          January 6th - 10th 2025
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'live'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'live' ? 1 : 0.6 }}
          onClick={() => setDataMode('live')}
        >
          {`LIVE`}
        </button>
        <div>
          <p
            style={{
              minWidth: 180,
              fontWeight: dataMode === 'live' ? 'bold' : 'normal',
            }}
          >
            {isLoading ? <Spinner size={30} /> : `${getDateRangeString()}`}
          </p>
        </div>
      </div>
    </div>
  );

  const DatasetControlsLarge = (
    <div className="dataset-controls">
      <div className="content-actions">
        <p
          style={{ fontWeight: dataMode === 'historical' ? 'bold' : 'normal' }}
        >
          January 6th - 10th 2025
        </p>
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'historical'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'historical' ? 1 : 0.6 }}
          onClick={() => setDataMode('historical')}
        >
          {`HISTORICAL`}
        </button>
        <button
          className={`px-4 py-2 mr-2 rounded ${
            dataMode === 'live'
              ? 'bg-red-500 text-white'
              : 'bg-gray-500 text-black'
          }`}
          style={{ opacity: dataMode === 'live' ? 1 : 0.6 }}
          onClick={() => setDataMode('live')}
        >
          {`LIVE`}
        </button>
        <div>
          <p
            style={{
              minWidth: 180,
              fontWeight: dataMode === 'live' ? 'bold' : 'normal',
            }}
          >
            {isLoading ? <Spinner /> : `${getDateRangeString()}`}
          </p>
        </div>
      </div>
    </div>
  );

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img
            src="/logo_fires_satellites.png"
            style={{
              width: imageSize,
              height: imageSize,
              marginLeft: -30,
              marginRight: -10,
            }}
          />
          <div>
            <div>
              <span style={{ fontSize: 50 }}>{'GROW'}</span>
            </div>
            <span style={{ fontSize: isLargeScreen ? 20 : 14 }}>
              {'Global Recovery and Observation of Wildfires'}
            </span>
          </div>
        </div>
        {isLargeScreen && (
          <div style={{ flexDirection: 'row' }}>
            <Button
              icon={ExternalLink}
              iconPosition="end"
              buttonStyle="flush"
              style={{ fontSize: 18, textAlign: 'right' }}
              label={`Presentation Slide Deck`}
              onClick={openSlideDeck}
            />
          </div>
        )}
        <img
          src="/nasa-logo.png"
          style={{ width: imageSize, height: imageSize }}
        />
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-actions voice-actions">
            <div className="voice-status">
              <span style={{ fontWeight: 600 }}>Realtime Voice</span>
              <span>{voiceStatusLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {voiceStatus === 'running' ? (
                <Button
                  icon={Square}
                  label="Stop Session"
                  buttonStyle="alert"
                  disabled={voiceStatus !== 'running'}
                  onClick={stopVoiceSession}
                />
              ) : (
                <Button
                  icon={Mic}
                  label={isSessionActive ? 'Starting…' : 'Start Voice Session'}
                  disabled={isSessionActive}
                  onClick={startVoiceSession}
                />
              )}
              <Button
                icon={RefreshCw}
                label="Reset"
                buttonStyle="flush"
                disabled={!conversationItems.length && !realtimeEvents.length}
                onClick={resetConversation}
              />
              {isSessionActive &&
                (voiceStatus === 'connecting' ||
                  voiceStatus === 'authorizing') && <Spinner size={18} />}
            </div>
          </div>
          {voiceError && (
            <div className="voice-error">
              <AlertTriangle size={16} />
              <span>{voiceError}</span>
            </div>
          )}
          <div className="conversation">
            <div className="content-block-body">
              {conversationItems.length === 0 ? (
                <p style={{ margin: 0 }}>
                  Press <strong>Start Voice Session</strong> and begin speaking
                  to hear the assistant respond.
                </p>
              ) : (
                conversationItems.map((item: any) => {
                  const roleLabel = (item.role ||
                    item.type ||
                    'item') as string;
                  const normalizedRole = roleLabel.toLowerCase();
                  const transcriptRaw = item?.formatted?.transcript || '';
                  const transcript =
                    transcriptRaw?.trim() === '' ? '' : transcriptRaw?.trim();
                  const textContent = item?.formatted?.text?.trim() || '';
                  const message =
                    transcript || textContent || '[audio message]';
                  return (
                    <div key={item.id} className="conversation-item">
                      <div className={`speaker ${normalizedRole}`}>
                        {roleLabel}
                      </div>
                      <div className="speaker-content">
                        <div>{message}</div>
                        {item.status && item.status !== 'completed' && (
                          <div style={{ fontSize: 11, opacity: 0.6 }}>
                            {item.status}
                          </div>
                        )}
                      </div>
                      <button
                        className="close"
                        type="button"
                        aria-label={`Remove item ${roleLabel}`}
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <X />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="events">
            <div className="content-block-body">
              {realtimeEvents.length === 0 ? (
                <p style={{ margin: 0 }}>
                  Realtime events will appear here once the session starts.
                </p>
              ) : (
                realtimeEvents
                  .map((eventEntry, index) => ({ eventEntry, index }))
                  .reverse()
                  .map(({ eventEntry, index }) => {
                    const actualIndex = index;
                    const eventType =
                      (eventEntry.event?.type as string) || 'event';
                    const isExpanded = expandedEventIndex === actualIndex;
                    const sourceClass = `event-source ${eventEntry.source}`;
                    const isError = eventType.includes('error');
                    return (
                      <div
                        key={`${eventEntry.time}-${actualIndex}`}
                        className="event"
                        onClick={() => toggleEventDetails(actualIndex)}
                      >
                        <div className="event-timestamp">
                          <div>{formatTime(eventEntry.time)}</div>
                        </div>
                        <div className="event-details">
                          <div className="event-summary">
                            <span
                              className={`${sourceClass}${
                                isError ? ' error' : ''
                              }`}
                            >
                              {eventEntry.source === 'client'
                                ? 'Client'
                                : 'Server'}
                            </span>
                            <span>{eventType}</span>
                          </div>
                          {isExpanded && (
                            <pre style={{ margin: 0 }}>
                              {JSON.stringify(eventEntry.event, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
          <div className="visualization">
            <div className="visualization-entry client">
              <span style={{ fontSize: 11 }}>Mic</span>
              <canvas ref={inputCanvasRef} />
            </div>
            <div className="visualization-entry server">
              <span style={{ fontSize: 11 }}>AI</span>
              <canvas ref={outputCanvasRef} />
            </div>
          </div>
        </div>
        <div className="content-right">
          <div className="content-block map" style={{ height: '100%' }}>
            <MBox
              isLargeScreen={isLargeScreen}
              dataMode={dataMode}
              setIsLoading={setIsLoading}
            />
          </div>
        </div>
        {isLargeScreen ? DatasetControlsLarge : DatasetControlsSmall}
        {!isLargeScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            style={{ fontSize: 18, textAlign: 'center' }}
            label={`Presentation Slide Deck`}
            onClick={openSlideDeck}
          />
        )}
      </div>
      {isLightboxOpen && (
        <div className="lightbox">
          <div className="lightbox-content">
            <button className="close-button" onClick={closeLightbox}>
              <X />
            </button>
            {/* <iframe
              src="https://docs.google.com/presentation/d/e/2PACX-1vTAt9Nm2nNJb10eOdq_wcpM7IvLHe4azYY5qqazgSbwziSoeB52P6A8aJQEKSuRDy5tEhBbGbrzH84w/embed?start=false&loop=false&delayms=3000"
              frameBorder="0"
              width="960"
              height="569"
              allowFullScreen={true}
            ></iframe> */}
            <iframe
              src={SLIDE_DECK_LINK}
              frameBorder="0"
              width="960"
              height="569"
              allowFullScreen={true}
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
}

const imageSize = 130;

/**
 * Returns a string with the correct ordinal suffix.
 * e.g., 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", ...
 */
function addOrdinalSuffix(day: any) {
  const remainder10 = day % 10;
  const remainder100 = day % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return day + 'th';
  }

  switch (remainder10) {
    case 1:
      return day + 'st';
    case 2:
      return day + 'nd';
    case 3:
      return day + 'rd';
    default:
      return day + 'th';
  }
}

export function getDateRangeString() {
  // Today’s date
  const today = new Date();

  // Clone the date, then subtract 4 days
  const fourDaysAgo = new Date(today);
  fourDaysAgo.setDate(today.getDate() - 4);

  // Create options for month name
  const monthOptions: Intl.DateTimeFormatOptions = {
    month: 'long', // or 'short' | 'narrow' | 'numeric' | '2-digit'
  };

  // Get individual pieces: day, month, year
  const startDay = fourDaysAgo.getDate();
  const startMonth = fourDaysAgo.toLocaleString('en-US', monthOptions);
  const startYear = fourDaysAgo.getFullYear();

  const endDay = today.getDate();
  const endMonth = today.toLocaleString('en-US', monthOptions);
  const endYear = today.getFullYear();

  // Build ordinal dates
  const startDayOrdinal = addOrdinalSuffix(startDay);
  const endDayOrdinal = addOrdinalSuffix(endDay);

  // If the month and year are the same, simplify the display
  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDayOrdinal} - ${endDayOrdinal} ${startYear}`;
  }

  // Otherwise, show full ranges
  return (
    `${startMonth} ${startDayOrdinal} ${startYear} - ` +
    `${endMonth} ${endDayOrdinal} ${endYear}`
  );
}
