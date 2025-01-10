/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Zap, ArrowUp, ArrowDown, ExternalLink } from 'react-feather';
import { Button } from '../components/button/Button';

import './ConsolePage.scss';
import { fetchObservations } from '../state/supabase/supabase';
import { Toggle } from '../components/toggle/Toggle';
import { IMapCoords, MBox } from '../components/mbox/MBox';

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey =
    'openAI package needs to be updated because it is unsupported now';
  // const apiKey = LOCAL_RELAY_SERVER_URL
  //   ? ''
  //   : localStorage.getItem('tmp::voice_api_key') ||
  //     prompt('OpenAI API Key') ||
  //     '';
  // if (apiKey !== '') {
  //   localStorage.setItem('tmp::voice_api_key', apiKey);
  // }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const P1COORDS = { lat: -21.363987, lng: -47.3355236 };
  const P2COORDS = { lat: -0.363987, lng: -60.3355236 };
  const [mapPosition, setMapPosition] = useState<IMapCoords>(P2COORDS);

  const [marker, setMarker] = useState<Coordinates | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  const openSlideDeck = useCallback(() => {
    setIsLightboxOpen(true);
  }, []);

  // Add this function to close the lightbox
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setRealtimeEvents([]);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`,
        // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // Add tools
    client.addTool(
      {
        name: 'get_observations',
        description:
          'Accepts a SQL query and returns a number, compatible with PostgreSQL and PostGIS with this schema: add a function get_observations that accepts a sql query and returns a number. The query should be compatible with postgresql and geogis. this is the schema: CREATE TABLE observations (id SERIAL PRIMARY KEY, latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, brightness DOUBLE PRECISION NOT NULL, scan DOUBLE PRECISION, track DOUBLE PRECISION, acq_date DATE NOT NULL, acq_time TIME NOT NULL, satellite VARCHAR(10) NOT NULL, confidence INTEGER, version VARCHAR(20), bright_t31 DOUBLE PRECISION, frp DOUBLE PRECISION, daynight VARCHAR(1), location GEOGRAPHY(POINT, 4326)',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description:
                'SQL query to retrieve observations from the database',
            },
          },
          additionalProperties: false,
        },
      },
      async ({ query }: { query: string }) => {
        return fetchObservations(query);
      }
    );
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );

    client.addTool(
      {
        name: 'get_last_rain',
        description:
          'Retrieves the the last time it rained in a location, which is important to predict if an area is in danger of wildfires. It returns the number of days since last rainfall, or -1 is longer than 10 days ago',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
          },
          required: ['lat', 'lng'],
        },
      },
      async ({ lat, lng }: { [key: string]: any }) => {
        const today = new Date();
        const endDate = today.toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        const startDate = new Date(today.setDate(today.getDate() - 30))
          .toISOString()
          .split('T')[0];

        // Build the URL
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum`;

        try {
          // Fetch the data from the API
          const response = await fetch(url);
          const data = await response.json();

          // Extract the daily precipitation data and dates
          const precipitationData = data.daily.precipitation_sum;
          const dates = data.daily.time;

          // Find the last date it rained
          let lastRainDate: string | null = null;
          for (let i = precipitationData.length - 1; i >= 0; i--) {
            if (precipitationData[i] > 0) {
              lastRainDate = dates[i];
              break;
            }
          }

          // Calculate the number of days without rain
          if (lastRainDate) {
            const lastRain = new Date(lastRainDate);
            const daysWithoutRain = Math.floor(
              (today.getTime() - lastRain.getTime()) / (1000 * 60 * 60 * 24)
            );
            console.log(`The last time it rained was on ${lastRainDate}.`);
            console.log(`It has been ${daysWithoutRain} days without rain.`);
            return daysWithoutRain;
          } else {
            console.log('No rain in the last 30 days.');
            return 30; // Assume 30 days without rain if there's no rain in the last 30 days
          }
        } catch (error) {
          console.error('Error fetching data:', error);
          return null;
        }
      }
    );
    client.addTool(
      {
        name: 'map_fly_to',
        description:
          'Sets the map location of the map displayed in the UI to the given long and lat',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
          },
          required: ['lat', 'lng'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMapPosition({ lat, lng });
      }
    );

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * State to track window width
   */
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  /**
   * Update window width on resize
   */
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isSmallScreen = windowWidth >= 560;

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
              <span style={{ fontSize: 50 }}>GROW</span>
            </div>
            <span style={{ fontSize: 20 }}>
              Global Recovery and Observation of Wildfires
            </span>
          </div>
        </div>
        {isSmallScreen && (
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
        <div className="content-right">
          <div className="content-block map" style={{ height: '100%' }}>
            <MBox coords={mapPosition} />
          </div>
        </div>
        {/* <div className="content-logs">
          <div className="content-actions">
            <Toggle
              defaultValue={false}
              labels={['manual', 'vad']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            <div className="spacer" />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'release to send' : 'push to talk'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spacer" />
            <Button
              label={isConnected ? 'disconnect' : 'connect'}
              iconPosition={isConnected ? 'end' : 'start'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={
                isConnected ? disconnectConversation : connectConversation
              }
            />
          </div>
        </div> */}
        {!isSmallScreen && (
          <Button
            icon={ExternalLink}
            iconPosition="end"
            // buttonStyle="flush"
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
              src="https://docs.google.com/presentation/d/e/2PACX-1vTezgMfwMSMOTV1xAERxRqVY9TMX-bF-45w2v5gP4jbs8Wy1t_H3u5kTwkxNfQFcA/embed?start=false&loop=false&delayms=60000"
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
