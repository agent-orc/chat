import type {
  ChatAttachmentRef,
  ChatDraftAttachment,
  ChatLegacyAttachmentRef,
  ChatStoredAttachmentRef,
  ChatUnavailableAttachmentRef,
} from './chat-types';

/** Project-relative root owned by the attachment contract. */
export const CHAT_ATTACHMENT_STORAGE_ROOT = '.coding-agent-chat/conversations';

export type ChatAttachmentContent = Blob | ArrayBuffer | Uint8Array;

export interface ChatAttachmentStorage {
  /**
   * Durably writes project-relative content. Implementations should create
   * parent directories and use an atomic replace/rename before resolving.
   */
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
  /** Returns null only when the project-relative file does not exist. */
  read(relativePath: string): Promise<Uint8Array | null>;
  /** Converts a project-relative path to a canonical absolute filesystem path. */
  absolutePath(relativePath: string): string;
}

export interface PersistChatAttachmentInput {
  content: ChatAttachmentContent;
  /** Required for ArrayBuffer/Uint8Array; Blob.type is used as a fallback. */
  mime?: string;
  alt: string;
}

export type ChatAttachmentUnavailableReason =
  | 'already-unavailable'
  | 'hash-mismatch'
  | 'invalid-reference'
  | 'legacy-not-found'
  | 'not-found'
  | 'read-failed'
  | 'unsupported-legacy-reference';

export interface AvailableChatAttachment {
  status: 'available';
  source: 'contract' | 'legacy';
  ref: ChatStoredAttachmentRef | ChatLegacyAttachmentRef;
  /** Null only for a legacy data URL, which has bytes but no filesystem path. */
  absolutePath: string | null;
  bytes: Uint8Array;
}

export interface UnavailableChatAttachment {
  status: 'unavailable';
  reason: ChatAttachmentUnavailableReason;
  ref: ChatUnavailableAttachmentRef;
}

export type ChatAttachmentResolution = AvailableChatAttachment | UnavailableChatAttachment;

export type ChatAttachmentLogEvent =
  | {
      event: 'chat.attachment.persisted';
      relativePath: string;
      mime: string;
      sizeBytes: number;
      durationMs: number;
    }
  | {
      event: 'chat.attachment.resolved';
      relativePath: string;
      source: 'contract' | 'legacy';
      sizeBytes: number;
      durationMs: number;
    }
  | {
      event: 'chat.attachment.unavailable';
      reference: string;
      reason: ChatAttachmentUnavailableReason;
      durationMs: number;
    };

export interface ChatAttachmentContractOptions {
  /** Structured observability hook; logging failures never fail attachment I/O. */
  log?: (event: ChatAttachmentLogEvent) => void;
  /** Defaults to true. Disable only when integrity is verified below this layer. */
  verifyContentHash?: boolean;
}

/**
 * Host-neutral durable attachment service.
 *
 * The library owns paths, names, hashing, migration and validation. Hosts own
 * the small filesystem adapter because the core package intentionally has no
 * Node or Angular dependency. Reusing an adapter rooted at the same project is
 * what makes references resolve after process/browser restarts.
 */
export class ChatAttachmentContract {
  private readonly verifyContentHash: boolean;

  constructor(
    private readonly storage: ChatAttachmentStorage,
    private readonly options: ChatAttachmentContractOptions = {},
  ) {
    this.verifyContentHash = options.verifyContentHash !== false;
  }

  /** Persist bytes under the canonical per-conversation content-addressed path. */
  async persist(
    conversationId: string,
    input: PersistChatAttachmentInput,
  ): Promise<ChatStoredAttachmentRef> {
    const started = now();
    const bytes = await contentBytes(input.content);
    const mime = normalizeMime(input.mime || blobMime(input.content));
    const hash = await sha256(bytes);
    const relativePath = attachmentRelativePath(conversationId, hash, mime);

    await this.storage.write(relativePath, bytes);

    const ref: ChatStoredAttachmentRef = {
      kind: 'stored',
      schemaVersion: 1,
      relativePath,
      contentHash: `sha256:${hash}`,
      mime,
      sizeBytes: bytes.byteLength,
      alt: input.alt.trim() || 'attachment',
    };
    this.log({
      event: 'chat.attachment.persisted',
      relativePath,
      mime,
      sizeBytes: bytes.byteLength,
      durationMs: elapsed(started),
    });
    return ref;
  }

  /** Convenience bridge from the composer's paste/drop output. */
  persistDraft(
    conversationId: string,
    draft: ChatDraftAttachment,
  ): Promise<ChatStoredAttachmentRef> {
    return this.persist(conversationId, {
      content: draft.file,
      mime: draft.file.type,
      alt: draft.alt,
    });
  }

  /** Resolve contract refs and recoverable legacy refs to bytes/path. */
  async resolve(ref: ChatAttachmentRef): Promise<ChatAttachmentResolution> {
    const started = now();
    if (ref.kind === 'unavailable') {
      return this.unavailable(ref, 'already-unavailable', ref.legacyUrl ?? ref.alt, started);
    }
    if (ref.kind === 'stored') return this.resolveStored(ref, started);
    return this.resolveLegacy(ref, started);
  }

  /** Null-safe convenience API for hosts that only need a runner filesystem path. */
  async absolutePath(ref: ChatAttachmentRef): Promise<string | null> {
    const resolution = await this.resolve(ref);
    return resolution.status === 'available' ? resolution.absolutePath : null;
  }

  /** Null-safe convenience API for hosts that need to stream/serve the content. */
  async bytes(ref: ChatAttachmentRef): Promise<Uint8Array | null> {
    const resolution = await this.resolve(ref);
    return resolution.status === 'available' ? resolution.bytes : null;
  }

  /**
   * Copies an old attachment into the canonical path. Missing/unsupported old
   * references become explicit tombstones instead of silently broken images.
   */
  async migrate(
    conversationId: string,
    ref: ChatAttachmentRef,
  ): Promise<ChatStoredAttachmentRef | ChatUnavailableAttachmentRef> {
    if (ref.kind === 'stored') {
      const resolution = await this.resolve(ref);
      return resolution.status === 'available' ? ref : resolution.ref;
    }
    if (ref.kind === 'unavailable') return ref;

    const resolution = await this.resolve(ref);
    if (resolution.status === 'unavailable') return resolution.ref;
    return this.persist(conversationId, {
      content: resolution.bytes,
      mime: ref.mime || mimeFromLegacyUrl(ref.url),
      alt: ref.alt,
    });
  }

  /** Migrates an archived message attachment list, including old string refs. */
  async migrateAll(
    conversationId: string,
    refs: readonly (ChatAttachmentRef | string)[],
  ): Promise<(ChatStoredAttachmentRef | ChatUnavailableAttachmentRef)[]> {
    return Promise.all(
      refs.map((ref) =>
        this.migrate(conversationId, typeof ref === 'string' ? legacyChatAttachment(ref) : ref),
      ),
    );
  }

  private async resolveStored(
    ref: ChatStoredAttachmentRef,
    started: number,
  ): Promise<ChatAttachmentResolution> {
    if (!validStoredRef(ref)) {
      return this.unavailable(ref, 'invalid-reference', ref.relativePath, started);
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await this.storage.read(ref.relativePath);
    } catch {
      return this.unavailable(ref, 'read-failed', ref.relativePath, started);
    }
    if (bytes === null) return this.unavailable(ref, 'not-found', ref.relativePath, started);

    if (this.verifyContentHash && `sha256:${await sha256(bytes)}` !== ref.contentHash) {
      return this.unavailable(ref, 'hash-mismatch', ref.relativePath, started);
    }

    this.log({
      event: 'chat.attachment.resolved',
      relativePath: ref.relativePath,
      source: 'contract',
      sizeBytes: bytes.byteLength,
      durationMs: elapsed(started),
    });
    return {
      status: 'available',
      source: 'contract',
      ref,
      absolutePath: this.storage.absolutePath(ref.relativePath),
      bytes,
    };
  }

  private async resolveLegacy(
    ref: ChatLegacyAttachmentRef,
    started: number,
  ): Promise<ChatAttachmentResolution> {
    const dataBytes = decodeDataUrl(ref.url);
    if (dataBytes) {
      this.log({
        event: 'chat.attachment.resolved',
        relativePath: '(data-url)',
        source: 'legacy',
        sizeBytes: dataBytes.byteLength,
        durationMs: elapsed(started),
      });
      return {
        status: 'available',
        source: 'legacy',
        ref,
        absolutePath: null,
        bytes: dataBytes,
      };
    }

    const relativePath = safeLegacyPath(ref.url);
    if (!relativePath) {
      return this.unavailable(ref, 'unsupported-legacy-reference', ref.url, started);
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await this.storage.read(relativePath);
    } catch {
      return this.unavailable(ref, 'read-failed', ref.url, started);
    }
    if (bytes === null) return this.unavailable(ref, 'legacy-not-found', ref.url, started);

    this.log({
      event: 'chat.attachment.resolved',
      relativePath,
      source: 'legacy',
      sizeBytes: bytes.byteLength,
      durationMs: elapsed(started),
    });
    return {
      status: 'available',
      source: 'legacy',
      ref,
      absolutePath: this.storage.absolutePath(relativePath),
      bytes,
    };
  }

  private unavailable(
    ref: ChatAttachmentRef,
    reason: ChatAttachmentUnavailableReason,
    reference: string,
    started: number,
  ): UnavailableChatAttachment {
    const unavailableRef: ChatUnavailableAttachmentRef =
      ref.kind === 'unavailable'
        ? ref
        : {
            kind: 'unavailable',
            alt: ref.alt,
            reason,
            legacyUrl: ref.kind === 'stored' ? ref.relativePath : ref.url,
          };
    this.log({
      event: 'chat.attachment.unavailable',
      reference,
      reason,
      durationMs: elapsed(started),
    });
    return { status: 'unavailable', reason, ref: unavailableRef };
  }

  private log(event: ChatAttachmentLogEvent): void {
    try {
      this.options.log?.(event);
    } catch {
      // Observability must never make a successful attachment operation fail.
    }
  }
}

/** Wraps an archived string path in the backwards-compatible public shape. */
export function legacyChatAttachment(
  url: string,
  alt = fileName(url) || 'attachment',
): ChatLegacyAttachmentRef {
  return { kind: 'legacy', url, alt };
}

export function isStoredChatAttachmentRef(ref: ChatAttachmentRef): ref is ChatStoredAttachmentRef {
  return ref.kind === 'stored';
}

/** Canonical path builder, exported so storage/serving routes can share it. */
export function attachmentRelativePath(
  conversationId: string,
  sha256Hex: string,
  mime: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(sha256Hex))
    throw new Error('sha256Hex must be 64 lowercase hex characters');
  return `${CHAT_ATTACHMENT_STORAGE_ROOT}/${conversationSegment(conversationId)}/attachments/${sha256Hex}.${extensionForMime(normalizeMime(mime))}`;
}

function validStoredRef(ref: ChatStoredAttachmentRef): boolean {
  if (
    ref.schemaVersion !== 1 ||
    typeof ref.contentHash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(ref.contentHash) ||
    typeof ref.mime !== 'string' ||
    typeof ref.relativePath !== 'string'
  )
    return false;
  const hash = ref.contentHash.slice('sha256:'.length);
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0) return false;
  try {
    if (ref.mime !== normalizeMime(ref.mime)) return false;
  } catch {
    return false;
  }
  if (!safeProjectRelativePath(ref.relativePath)) return false;
  const suffix = `/attachments/${hash}.${extensionForMime(ref.mime)}`;
  return (
    ref.relativePath.startsWith(`${CHAT_ATTACHMENT_STORAGE_ROOT}/`) &&
    ref.relativePath.endsWith(suffix)
  );
}

function conversationSegment(conversationId: string): string {
  const trimmed = conversationId.trim();
  if (!trimmed) throw new Error('conversationId is required');
  const encoded = encodeURIComponent(trimmed)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\./g, '%2E');
  if (encoded.length > 180)
    throw new Error('conversationId is too long for a portable attachment path');
  return encoded;
}

function safeLegacyPath(value: string): string | null {
  if (/^data:/i.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  return safeProjectRelativePath(path) ? path : null;
}

function safeProjectRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0')) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'image/svg+xml':
      return 'svg';
    case 'image/bmp':
      return 'bmp';
    case 'image/tiff':
      return 'tif';
    default:
      return 'bin';
  }
}

function normalizeMime(mime: string): string {
  const normalized = mime.split(';', 1)[0].trim().toLowerCase();
  if (!normalized || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)) {
    throw new Error('A valid attachment MIME type is required');
  }
  return normalized;
}

function mimeFromLegacyUrl(url: string): string {
  const dataMime = /^data:([^;,]+)/i.exec(url)?.[1];
  if (dataMime) return normalizeMime(dataMime);
  const extension = url.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

function blobMime(content: ChatAttachmentContent): string {
  if (
    ArrayBuffer.isView(content) ||
    Object.prototype.toString.call(content) === '[object ArrayBuffer]'
  ) {
    return '';
  }
  const type = (content as { type?: unknown }).type;
  return typeof type === 'string' ? type : '';
}

async function contentBytes(content: ChatAttachmentContent): Promise<Uint8Array> {
  // `instanceof` is intentionally avoided here: pasted Files/typed arrays can
  // cross iframe, jsdom and VM realms while still being valid platform values.
  if (ArrayBuffer.isView(content)) {
    return Uint8Array.from(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
  }
  if (Object.prototype.toString.call(content) === '[object ArrayBuffer]') {
    return new Uint8Array(content as ArrayBuffer).slice();
  }
  const blob = content as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read attachment Blob'));
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob);
    });
  }
  throw new Error('Blob.arrayBuffer or FileReader is required to read attachment content');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error('Web Crypto SHA-256 is required for attachment integrity');
  const source = new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeDataUrl(value: string): Uint8Array | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(value);
  if (!match) return null;
  try {
    if (match[2]) {
      const binary = atob(match[3]);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(match[3]));
  } catch {
    return null;
  }
}

function fileName(value: string): string {
  const clean = value.split(/[?#]/, 1)[0];
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1);
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function elapsed(started: number): number {
  return Math.max(0, Math.round((now() - started) * 100) / 100);
}
