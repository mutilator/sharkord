import type {
  CommandDefinition,
  TInvokerContext,
  TPluginComponentsMapBySlotId,
  TPluginSettingDefinition,
  TPluginSlotContext
} from '@sharkord/shared';
import { PluginSlot } from '@sharkord/shared';
import type { AppData, Producer, Router } from 'mediasoup/types';

export { PluginSlot };
export type {
  TInvokerContext,
  TPluginComponentsMapBySlotId,
  TPluginSlotContext
};

export type TCreateStreamOptions = {
  channelId: number;
  title: string;
  key: string;
  avatarUrl?: string;
  producers: {
    audio?: Producer;
    video?: Producer;
  };
};

export type TExternalStreamHandle = {
  streamId: number;
  remove: () => void;
  update: (options: {
    title?: string;
    avatarUrl?: string;
    producers?: {
      audio?: Producer;
      video?: Producer;
    };
  }) => void;
};

export type ServerEvent =
  | 'user:joined'
  | 'user:left'
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  | 'voice:runtime_initialized'
  | 'voice:runtime_closed';

export interface EventPayloads {
  'user:joined': {
    userId: number;
    username: string;
  };
  'user:left': {
    userId: number;
    username: string;
  };
  'message:created': {
    messageId: number;
    channelId: number;
    userId: number;
    content: string;
  };
  'message:updated': {
    messageId: number;
    channelId: number;
    userId: number;
    content: string;
  };
  'message:deleted': {
    messageId: number;
    channelId: number;
  };
  'voice:runtime_initialized': {
    channelId: number;
  };
  'voice:runtime_closed': {
    channelId: number;
  };
}

// this API is probably going to change a lot in the future
// so consider it as experimental for now

type SettingValueType<T extends TPluginSettingDefinition> =
  T['type'] extends 'string'
    ? string
    : T['type'] extends 'number'
      ? number
      : T['type'] extends 'boolean'
        ? boolean
        : unknown;

export interface PluginSettings<
  T extends readonly TPluginSettingDefinition[] = TPluginSettingDefinition[]
> {
  get<K extends T[number]['key']>(
    key: K
  ): SettingValueType<Extract<T[number], { key: K }>>;
  set<K extends T[number]['key']>(
    key: K,
    value: SettingValueType<Extract<T[number], { key: K }>>
  ): void;
}

export interface PluginContext {
  path: string;

  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;

  events: {
    on<E extends ServerEvent>(
      event: E,
      handler: (payload: EventPayloads[E]) => void | Promise<void>
    ): void;
  };

  actions: {
    voice: {
      getRouter(channelId: number): Router<AppData>;
      createStream(options: TCreateStreamOptions): TExternalStreamHandle;
      getListenInfo(): {
        ip: string;
        announcedAddress: string | undefined;
      };
    };
    messages: {
      /**
       * Create a message in a channel. The caller may supply an existing
       * `userId` that will be recorded as the author; if omitted the server
       * will fall back to a system user (usually id 1).  `content` is the
       * sanitized HTML string to store.  Additional properties such as `embed`
       * may be provided and will be persisted in the message metadata column.
       *
       * Returns the newly created message ID.
       */
      create(options: {
        channelId: number;
        userId?: number;
        content?: string;
        parentMessageId?: number | null;
        embed?: unknown;
      }): Promise<number>;

      /**
       * Update a message.  The second argument may be a simple string (new
       * content) or an object containing `{ content?, embed? }`.  The latter
       * form is used by the built‑in embeds plugin and mirrors the old
       * `ctx.messages` API.
       */
      update(
        messageId: number,
        content: string | { content?: string; embed?: unknown }
      ): Promise<void>;

      /** Delete a message by id. Any attached files will be cleaned up just
       * like the normal API. */
      delete(messageId: number): Promise<void>;
    };
  };

  commands: {
    register<TArgs = void>(command: CommandDefinition<TArgs>): void;
  };

  settings: {
    register<T extends readonly TPluginSettingDefinition[]>(
      definitions: T
    ): Promise<PluginSettings<T>>;
  };

  ui: {
    registerComponents(components: TPluginComponentsMapBySlotId): void;
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UnloadPluginContext extends Pick<
  PluginContext,
  'log' | 'debug' | 'error'
> {}

// re-export mediasoup types for plugin usage
export type {
  AppData,
  MediaKind,
  PlainTransport,
  PlainTransportOptions,
  Producer,
  ProducerOptions,
  Router,
  RtpCodecCapability,
  RtpEncodingParameters,
  RtpParameters,
  Transport
} from 'mediasoup/types';
