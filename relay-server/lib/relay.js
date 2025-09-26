import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import { OpenAIRealtimeWS } from 'openai/realtime/ws';

const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2025-08-28';

export class RealtimeRelay {
  constructor(apiKey, { model } = {}) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_REALTIME_MODEL;
    this.openai = new OpenAI({ apiKey: this.apiKey });
    this.wss = null;
  }

  listen(port) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.connectionHandler.bind(this));
    this.log(`Listening on ws://localhost:${port}`);
  }

  async connectionHandler(ws, req) {
    if (!req.url) {
      this.log('No URL provided, closing connection.');
      ws.close();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname !== '/') {
      this.log(`Invalid pathname: "${pathname}"`);
      ws.close();
      return;
    }

    // Instantiate new client
    this.log(
      `Connecting to OpenAI realtime model "${
        this.model
      }" with key "${this.apiKey.slice(0, 3)}..."`
    );
    let client;
    try {
      client = await OpenAIRealtimeWS.create(this.openai, {
        model: this.model,
      });
    } catch (error) {
      this.log(`Failed creating realtime client: ${error.message}`);
      ws.close();
      return;
    }

    const messageQueue = [];
    const messageHandler = (data) => {
      try {
        const event = JSON.parse(data);
        this.log(`Relaying "${event.type}" to OpenAI`);
        client.send(event);
      } catch (e) {
        console.error(e.message);
        this.log(`Error parsing event from client: ${data}`);
      }
    };

    const flushQueue = () => {
      while (messageQueue.length) {
        const data = messageQueue.shift();
        if (data !== undefined) {
          messageHandler(data);
        }
      }
    };

    const isSocketReady = () =>
      Boolean(client?.socket) && client.socket.readyState === 1;

    const removeEventListener = (event, handler) => {
      if (typeof client.socket.off === 'function') {
        client.socket.off(event, handler);
      } else if (typeof client.socket.removeListener === 'function') {
        client.socket.removeListener(event, handler);
      } else if (typeof client.socket.removeEventListener === 'function') {
        client.socket.removeEventListener(event, handler);
      }
    };

    const addEventListener = (event, handler, { once = false } = {}) => {
      if (once && typeof client.socket.once === 'function') {
        client.socket.once(event, handler);
        return;
      }
      if (typeof client.socket.on === 'function') {
        client.socket.on(event, handler);
      } else if (typeof client.socket.addEventListener === 'function') {
        client.socket.addEventListener(event, handler, { once });
      }
    };

    const waitForSocket = () =>
      new Promise((resolve, reject) => {
        if (isSocketReady()) {
          resolve();
          return;
        }
        const cleanup = () => {
          removeEventListener('open', handleOpen);
          removeEventListener('error', handleError);
          removeEventListener('close', handleError);
        };
        const handleOpen = () => {
          cleanup();
          resolve();
        };
        const handleError = (err) => {
          cleanup();
          reject(err instanceof Error ? err : new Error('Connection failed'));
        };
        addEventListener('open', handleOpen, { once: true });
        addEventListener('error', handleError, { once: true });
        addEventListener('close', handleError, { once: true });
      });

    // Relay: OpenAI Realtime API Event -> Browser Event
    client.on('event', (event) => {
      this.log(`Relaying "${event.type}" to Client`);
      ws.send(JSON.stringify(event));
    });
    client.on('error', (error) => {
      this.log(`Realtime client error: ${error.message}`);
      ws.send(
        JSON.stringify({ type: 'error', error: { message: error.message } })
      );
    });
    addEventListener('close', () => ws.close());

    // Relay: Browser Event -> OpenAI Realtime API Event
    // We need to queue data waiting for the OpenAI connection
    ws.on('message', (data) => {
      if (!isSocketReady()) {
        messageQueue.push(data);
      } else {
        messageHandler(data);
      }
    });
    ws.on('close', () => {
      try {
        client.close();
      } catch (error) {
        this.log(`Error closing realtime client: ${error.message}`);
      }
    });

    // Wait for socket to be ready before forwarding queued messages
    try {
      await waitForSocket();
    } catch (e) {
      this.log(
        `Error connecting to OpenAI: ${e instanceof Error ? e.message : e}`
      );
      ws.close();
      return;
    }
    this.log(`Connected to OpenAI successfully!`);
    flushQueue();
  }

  log(...args) {
    console.log(`[RealtimeRelay]`, ...args);
  }
}
