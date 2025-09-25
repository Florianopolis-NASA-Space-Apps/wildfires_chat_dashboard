export interface SessionConfig {
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  output_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription: null | { model: string };
  turn_detection: null | {
    type: string;
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  tools: Array<{ type: 'function'; name: string; description?: string; parameters?: Record<string, unknown> }>;
  tool_choice: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  temperature: number;
  max_response_output_tokens: number | 'inf';
}

export interface RealtimeClientOptions {
  url?: string;
  debug?: boolean;
  apiKey?: string;
  model?: string;
}

type EventHandler = (...args: any[]) => void;

type RealtimeServerEvent = {
  type: string;
  event_id?: string;
  [key: string]: any;
};

type RealtimeClientEvent = {
  type: string;
  event_id?: string;
  [key: string]: any;
};

export interface ConversationItem {
  id: string;
  type: string;
  role?: string;
  status?: 'in_progress' | 'completed' | 'incomplete' | 'failed';
  name?: string;
  call_id?: string;
  output?: string;
  arguments?: string;
  content: Array<Record<string, any>>;
  formatted: {
    audio: Int16Array;
    text: string;
    transcript: string;
    tool?: {
      type: 'function';
      name: string;
      call_id: string;
      arguments: string;
    };
    output?: string;
  };
}

interface ConversationItemDelta {
  audio?: Int16Array;
  text?: string;
  transcript?: string;
  arguments?: string;
}

interface ConversationUpdatePayload {
  item: ConversationItem | null;
  delta: ConversationItemDelta | null;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  modalities: ['text', 'audio'],
  instructions: '',
  voice: 'verse',
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  input_audio_transcription: null,
  turn_detection: null,
  tools: [],
  tool_choice: 'auto',
  temperature: 0.8,
  max_response_output_tokens: 4096,
};

const DEFAULT_FREQUENCY = 24_000; // 24kHz matches GPT-4o realtime defaults.

class SimpleEventEmitter {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`RealtimeClient listener for "${event}" failed`, error);
      }
    }
  }
}

class ConversationStore {
  private items: ConversationItem[] = [];
  private itemLookup = new Map<string, ConversationItem>();
  private responseLookup = new Map<string, { id: string; output: string[] }>();
  private queuedSpeech = new Map<string, { audio_start_ms: number; audio_end_ms: number; audio?: Int16Array }>();
  private queuedTranscripts = new Map<string, { transcript: string }>();
  private queuedInputAudio: Int16Array | null = null;

  clear() {
    this.items = [];
    this.itemLookup.clear();
    this.responseLookup.clear();
    this.queuedSpeech.clear();
    this.queuedTranscripts.clear();
    this.queuedInputAudio = null;
  }

  setQueuedInputAudio(buffer: Int16Array) {
    this.queuedInputAudio = buffer;
  }

  getItems() {
    return this.items.map((item) => ({
      ...item,
      content: item.content.map((part) => ({ ...part })),
      formatted: {
        ...item.formatted,
        audio: item.formatted.audio.slice(),
        tool: item.formatted.tool ? { ...item.formatted.tool } : undefined,
      },
    }));
  }

  process(event: RealtimeServerEvent, inputAudioBuffer: Int16Array | null): ConversationUpdatePayload {
    switch (event.type) {
      case 'conversation.item.created':
        return this.handleItemCreated(event.item);
      case 'conversation.item.truncated':
        return this.handleItemTruncated(event);
      case 'conversation.item.deleted':
        return this.handleItemDeleted(event);
      case 'conversation.item.input_audio_transcription.completed':
        return this.handleItemTranscribed(event);
      case 'input_audio_buffer.speech_started':
        this.queuedSpeech.set(event.item_id, {
          audio_start_ms: event.audio_start_ms,
          audio_end_ms: event.audio_start_ms,
        });
        return emptyUpdate();
      case 'input_audio_buffer.speech_stopped':
        this.captureSpeechAudio(event, inputAudioBuffer);
        return emptyUpdate();
      case 'response.created':
        this.ensureResponse(event.response);
        return emptyUpdate();
      case 'response.output_item.added':
        this.appendResponseOutput(event);
        return emptyUpdate();
      case 'response.output_item.done':
        return this.handleResponseOutputDone(event);
      case 'response.content_part.added':
        return this.handleContentPartAdded(event);
      case 'response.audio_transcript.delta':
        return this.handleTranscriptDelta(event);
      case 'response.audio.delta':
        return this.handleAudioDelta(event);
      case 'response.text.delta':
        return this.handleTextDelta(event);
      case 'response.function_call_arguments.delta':
        return this.handleFunctionArgumentsDelta(event);
      default:
        return emptyUpdate();
    }
  }

  private handleItemCreated(rawItem: any): ConversationUpdatePayload {
    const clone = cloneJson(rawItem);
    let item = this.itemLookup.get(clone.id);
    if (!item) {
      const created: ConversationItem = {
        ...clone,
        content: Array.isArray(clone.content) ? clone.content : [],
        formatted: {
          audio: new Int16Array(0),
          text: '',
          transcript: '',
        },
      };
      this.itemLookup.set(created.id, created);
      this.items.push(created);
      item = created;
    }

    if (!item) {
      return emptyUpdate();
    }
    const ensuredItem: ConversationItem = item;

    if (Array.isArray(ensuredItem.content)) {
      for (const part of ensuredItem.content) {
        if (part.type === 'text' || part.type === 'input_text') {
          ensuredItem.formatted.text += part.text ?? '';
        }
      }
    }

    const queuedTranscript = this.queuedTranscripts.get(ensuredItem.id);
    if (queuedTranscript) {
      ensuredItem.formatted.transcript = queuedTranscript.transcript;
      this.queuedTranscripts.delete(ensuredItem.id);
    }

    if (ensuredItem.type === 'message') {
      if (ensuredItem.role === 'user') {
        ensuredItem.status = 'completed';
        if (this.queuedInputAudio) {
          ensuredItem.formatted.audio = this.queuedInputAudio;
          this.queuedInputAudio = null;
        }
      } else {
        ensuredItem.status = 'in_progress';
      }
    } else if (ensuredItem.type === 'function_call') {
      ensuredItem.status = 'in_progress';
      ensuredItem.formatted.tool = {
        type: 'function',
        name: ensuredItem.name ?? '',
        call_id: ensuredItem.call_id ?? '',
        arguments: '',
      };
    } else if (ensuredItem.type === 'function_call_output') {
      ensuredItem.status = 'completed';
      ensuredItem.formatted.output = ensuredItem.output;
    }

    const queuedSpeech = this.queuedSpeech.get(ensuredItem.id);
    if (queuedSpeech?.audio) {
      ensuredItem.formatted.audio = queuedSpeech.audio;
      this.queuedSpeech.delete(ensuredItem.id);
    }

    return { item: ensuredItem, delta: null };
  }

  private handleItemTruncated(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    const endIndex = Math.floor((event.audio_end_ms * DEFAULT_FREQUENCY) / 1000);
    item.formatted.transcript = '';
    item.formatted.audio = item.formatted.audio.slice(0, endIndex);
    return { item, delta: null };
  }

  private handleItemDeleted(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    this.itemLookup.delete(item.id);
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
    return { item, delta: null };
  }

  private handleItemTranscribed(event: any): ConversationUpdatePayload {
    const formattedTranscript = event.transcript || ' ';
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      this.queuedTranscripts.set(event.item_id, { transcript: formattedTranscript });
      return emptyUpdate();
    }
    const content = item.content[event.content_index];
    if (content) {
      content.transcript = event.transcript;
    }
    item.formatted.transcript = formattedTranscript;
    return { item, delta: { transcript: formattedTranscript } };
  }

  private captureSpeechAudio(event: any, inputAudioBuffer: Int16Array | null) {
    const record: { audio_start_ms: number; audio_end_ms: number; audio?: Int16Array } =
      this.queuedSpeech.get(event.item_id) ?? {
        audio_start_ms: event.audio_end_ms,
        audio_end_ms: event.audio_end_ms,
      };
    record.audio_end_ms = event.audio_end_ms;
    if (inputAudioBuffer) {
      const startIndex = Math.floor((record.audio_start_ms * DEFAULT_FREQUENCY) / 1000);
      const endIndex = Math.floor((record.audio_end_ms * DEFAULT_FREQUENCY) / 1000);
      record.audio = inputAudioBuffer.slice(startIndex, endIndex);
    }
    this.queuedSpeech.set(event.item_id, record);
  }

  private ensureResponse(response: any) {
    if (this.responseLookup.has(response.id)) {
      return;
    }
    this.responseLookup.set(response.id, {
      id: response.id,
      output: Array.isArray(response.output) ? [...response.output] : [],
    });
  }

  private appendResponseOutput(event: any) {
    const response = this.responseLookup.get(event.response_id);
    if (!response) {
      return;
    }
    response.output.push(event.item.id);
  }

  private handleResponseOutputDone(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item.id);
    if (!item) {
      return emptyUpdate();
    }
    item.status = event.item.status;
    return { item, delta: null };
  }

  private handleContentPartAdded(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    if (!Array.isArray(item.content)) {
      return emptyUpdate();
    }
    item.content.push(event.part);
    return { item, delta: null };
  }

  private handleTranscriptDelta(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    if (!Array.isArray(item.content)) {
      return emptyUpdate();
    }
    const part = item.content[event.content_index];
    if (part) {
      part.transcript = (part.transcript ?? '') + event.delta;
    }
    item.formatted.transcript += event.delta;
    return { item, delta: { transcript: event.delta } };
  }

  private handleAudioDelta(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    const append = base64ToInt16(event.delta);
    item.formatted.audio = mergeInt16(item.formatted.audio, append);
    return { item, delta: { audio: append } };
  }

  private handleTextDelta(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    if (!Array.isArray(item.content)) {
      return emptyUpdate();
    }
    const part = item.content[event.content_index];
    if (part) {
      part.text = (part.text ?? '') + event.delta;
    }
    item.formatted.text += event.delta;
    return { item, delta: { text: event.delta } };
  }

  private handleFunctionArgumentsDelta(event: any): ConversationUpdatePayload {
    const item = this.itemLookup.get(event.item_id);
    if (!item) {
      return emptyUpdate();
    }
    item.arguments = (item.arguments ?? '') + event.delta;
    if (item.formatted.tool) {
      item.formatted.tool.arguments += event.delta;
    }
    return { item, delta: { arguments: event.delta } };
  }
}

export class RealtimeClient extends SimpleEventEmitter {
  private readonly url: string;
  private readonly debug: boolean;
  private readonly apiKey: string | null;
  private readonly model: string | null;
  private socket: WebSocket | null = null;
  private sessionCreated = false;
  private sessionWaiters: Array<() => void> = [];
  private sessionConfig: SessionConfig = cloneSessionConfig(DEFAULT_SESSION_CONFIG);
  private inputAudioBuffer = new Int16Array(0);
  private hasUncommittedAudio = false;
  private readonly conversationStore = new ConversationStore();

  constructor({ url, debug = false, apiKey, model }: RealtimeClientOptions = {}) {
    super();
    const defaultUrl = 'wss://api.openai.com/v1/realtime';
    this.url = url ?? defaultUrl;
    this.debug = debug;
    this.apiKey = apiKey ?? null;
    this.model = model ?? null;
  }

  conversation = {
    clear: () => this.conversationStore.clear(),
    getItems: () => this.conversationStore.getItems(),
  } as const;

  isConnected() {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  async connect() {
    if (this.isConnected()) {
      throw new Error('RealtimeClient is already connected');
    }
    this.sessionCreated = false;

    const url = this.buildConnectionUrl();
    const protocols = this.buildConnectionProtocols();

    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    this.socket = ws;

    const openPromise = new Promise<void>((resolve, reject) => {
      const handleOpen = () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
        this.debugLog('Connected');
        resolve();
      };
      const handleError = () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
        reject(new Error('Failed to establish realtime connection'));
      };
      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);
    });

    ws.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        this.safeHandleServerEvent(data);
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        data
          .text()
          .then((text) => this.safeHandleServerEvent(text))
          .catch((error) => this.debugLog('Failed to read Blob message', error));
        return;
      }
      if (data instanceof ArrayBuffer) {
        const decoded = new TextDecoder().decode(data);
        this.safeHandleServerEvent(decoded);
        return;
      }
      if (ArrayBuffer.isView(data)) {
        const { buffer, byteOffset, byteLength } = data;
        const view = new Uint8Array(buffer, byteOffset, byteLength);
        const decoded = new TextDecoder().decode(view);
        this.safeHandleServerEvent(decoded);
        return;
      }
      this.safeHandleServerEvent(data);
    });

    ws.addEventListener('close', () => {
      this.debugLog('Socket closed');
      this.socket = null;
      this.sessionCreated = false;
      this.conversationStore.clear();
      this.emit('realtime.event', {
        time: new Date().toISOString(),
        source: 'system',
        event: { type: 'socket.closed' },
      });
    });

    ws.addEventListener('error', (event) => {
      this.debugLog('Socket error', event);
    });

    await openPromise;
    this.updateSession();
  }

  disconnect() {
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.socket = null;
    this.conversationStore.clear();
    this.inputAudioBuffer = new Int16Array(0);
    this.hasUncommittedAudio = false;
    this.sessionCreated = false;
  }

  async waitForSessionCreated() {
    if (this.sessionCreated) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.sessionWaiters.push(resolve);
    });
  }

  updateSession(partial: Partial<SessionConfig> = {}) {
    this.sessionConfig = { ...this.sessionConfig, ...partial };
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const payload = {
      session: this.sessionConfig,
    };
    this.sendEvent('session.update', payload);
  }

  appendInputAudio(arrayBuffer: ArrayBuffer | Int16Array) {
    const buffer = arrayBuffer instanceof Int16Array ? arrayBuffer : new Int16Array(arrayBuffer);
    if (buffer.byteLength === 0) {
      return;
    }
    this.sendEvent('input_audio_buffer.append', {
      audio: arrayBufferToBase64(buffer),
    });
    this.inputAudioBuffer = mergeInt16(this.inputAudioBuffer, buffer);
    this.hasUncommittedAudio = true;
    this.conversationStore.setQueuedInputAudio(this.inputAudioBuffer);
  }

  deleteItem(id: string) {
    this.sendEvent('conversation.item.delete', { item_id: id });
  }

  private sendEvent(type: string, payload: Record<string, unknown> = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('RealtimeClient is not connected');
    }
    const event: RealtimeClientEvent = {
      event_id: generateEventId('evt_'),
      type,
      ...payload,
    };
    this.socket.send(JSON.stringify(event));
    this.emit('realtime.event', {
      time: new Date().toISOString(),
      source: 'client',
      event,
    });
  }

  private safeHandleServerEvent(raw: any) {
    try {
      this.handleServerEvent(raw);
    } catch (error) {
      this.debugLog('Failed handling server event', error);
    }
  }

  private handleServerEvent(raw: any) {
    let event: RealtimeServerEvent;
    try {
      event = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      this.debugLog('Failed to parse server event', error);
      return;
    }

    this.emit('realtime.event', {
      time: new Date().toISOString(),
      source: 'server',
      event,
    });

    if (event.type === 'session.created') {
      this.sessionCreated = true;
      this.sessionWaiters.splice(0).forEach((resolve) => resolve());
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      this.emit('conversation.interrupted');
    }

    const { item, delta } = this.conversationStore.process(event, this.inputAudioBuffer);
    if (item) {
      this.emit('conversation.updated', { item, delta });
      if (item.status === 'completed') {
        this.emit('conversation.item.completed', { item });
      }
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.handleSpeechStopped();
    }
  }

  private handleSpeechStopped() {
    if (!this.hasUncommittedAudio || this.inputAudioBuffer.length === 0) {
      return;
    }
    try {
      this.sendEvent('input_audio_buffer.commit');
    } catch (error) {
      this.debugLog('Failed to commit audio buffer', error);
      return;
    }
    this.hasUncommittedAudio = false;
    this.inputAudioBuffer = new Int16Array(0);
    try {
      const responsePayload: Record<string, unknown> = {
        modalities: [...this.sessionConfig.modalities],
      };
      if (this.sessionConfig.instructions) {
        responsePayload.instructions = this.sessionConfig.instructions;
      }
      this.sendEvent('response.create', {
        response: responsePayload,
      });
    } catch (error) {
      this.debugLog('Failed to request response', error);
    }
  }

  private debugLog(...args: unknown[]) {
    if (this.debug) {
      console.debug('[RealtimeClient]', ...args);
    }
  }

  private buildConnectionUrl() {
    if (!this.model) {
      return this.url;
    }
    try {
      const parsed = new URL(this.url);
      parsed.searchParams.set('model', this.model);
      return parsed.toString();
    } catch (err) {
      this.debugLog('Failed to parse realtime URL, falling back to raw value', err);
      if (this.url.includes('?')) {
        return `${this.url}&model=${this.model}`;
      }
      return `${this.url}?model=${this.model}`;
    }
  }

  private buildConnectionProtocols(): string[] | undefined {
    if (!this.apiKey) {
      return undefined;
    }
    return [
      'realtime',
      `openai-insecure-api-key.${this.apiKey}`,
      'openai-beta.realtime-v1',
    ];
  }
}

function generateEventId(prefix: string) {
  const cryptoImpl: Crypto | undefined = (globalThis as any).crypto;
  if (cryptoImpl && typeof cryptoImpl.randomUUID === 'function') {
    return `${prefix}${cryptoImpl.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = prefix;
  for (let i = 0; i < 24; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function cloneSessionConfig(config: SessionConfig): SessionConfig {
  return {
    modalities: [...config.modalities],
    instructions: config.instructions,
    voice: config.voice,
    input_audio_format: config.input_audio_format,
    output_audio_format: config.output_audio_format,
    input_audio_transcription: config.input_audio_transcription
      ? { ...config.input_audio_transcription }
      : null,
    turn_detection: config.turn_detection ? { ...config.turn_detection } : null,
    tools: config.tools.map((tool) => ({ ...tool })),
    tool_choice:
      typeof config.tool_choice === 'object' && config.tool_choice !== null
        ? { ...config.tool_choice }
        : config.tool_choice,
    temperature: config.temperature,
    max_response_output_tokens: config.max_response_output_tokens,
  };
}

function cloneJson<T>(value: T): T {
  const structuredCloneFn: ((input: T) => T) | undefined = (globalThis as any).structuredClone;
  if (structuredCloneFn) {
    return structuredCloneFn(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function emptyUpdate(): ConversationUpdatePayload {
  return { item: null, delta: null };
}

function arrayBufferToBase64(buffer: Int16Array) {
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    const slice = view.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToInt16(input: string) {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return new Int16Array(out.buffer);
}

function mergeInt16(base: Int16Array, append: Int16Array) {
  if (base.length === 0) {
    return append.slice();
  }
  if (append.length === 0) {
    return base.slice();
  }
  const out = new Int16Array(base.length + append.length);
  out.set(base, 0);
  out.set(append, base.length);
  return out;
}
