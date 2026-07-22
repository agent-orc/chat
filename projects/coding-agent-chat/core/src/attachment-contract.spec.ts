import { describe, expect, it } from 'vitest';
import {
  ChatAttachmentContract,
  type ChatAttachmentLogEvent,
  type ChatAttachmentStorage,
  legacyChatAttachment,
} from './attachment-contract';
import type { ChatStoredAttachmentRef } from './chat-types';

class MemoryProjectStorage implements ChatAttachmentStorage {
  readonly files = new Map<string, Uint8Array>();

  async write(relativePath: string, bytes: Uint8Array): Promise<void> {
    this.files.set(relativePath, bytes.slice());
  }

  async read(relativePath: string): Promise<Uint8Array | null> {
    return this.files.get(relativePath)?.slice() ?? null;
  }

  absolutePath(relativePath: string): string {
    return `C:/project/${relativePath}`;
  }

  seed(relativePath: string, bytes: Uint8Array): void {
    this.files.set(relativePath, bytes.slice());
  }
}

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const hello = (): Uint8Array => new TextEncoder().encode('hello');

describe('ChatAttachmentContract', () => {
  it('persists pasted content at a stable per-conversation contract path', async () => {
    const storage = new MemoryProjectStorage();
    const events: ChatAttachmentLogEvent[] = [];
    const contract = new ChatAttachmentContract(storage, { log: (event) => events.push(event) });

    const ref = await contract.persist('task/CAC-12', {
      content: hello(),
      mime: 'Image/PNG; charset=binary',
      alt: 'clipboard image',
    });

    expect(ref).toEqual({
      kind: 'stored',
      schemaVersion: 1,
      relativePath: `.coding-agent-chat/conversations/task%2FCAC-12/attachments/${HELLO_SHA256}.png`,
      contentHash: `sha256:${HELLO_SHA256}`,
      mime: 'image/png',
      sizeBytes: 5,
      alt: 'clipboard image',
    });
    expect(Array.from(storage.files.get(ref.relativePath) ?? [])).toEqual(Array.from(hello()));
    expect(events[0]).toMatchObject({
      event: 'chat.attachment.persisted',
      relativePath: ref.relativePath,
      sizeBytes: 5,
    });
  });

  it('persists the File emitted by the paste/drop composer bridge', async () => {
    const storage = new MemoryProjectStorage();
    const contract = new ChatAttachmentContract(storage);

    const ref = await contract.persistDraft('conversation-42', {
      id: 'draft-1',
      file: new File([hello().buffer as ArrayBuffer], 'pasted.png', { type: 'image/png' }),
      alt: 'pasted',
      previewUrl: 'blob:preview-only',
    });

    expect(ref.relativePath).toBe(
      `.coding-agent-chat/conversations/conversation-42/attachments/${HELLO_SHA256}.png`,
    );
    expect(Array.from(storage.files.get(ref.relativePath) ?? [])).toEqual(Array.from(hello()));
    expect(ref).not.toHaveProperty('url');
  });

  it('resolves path and bytes from a new contract instance after restart', async () => {
    const storage = new MemoryProjectStorage();
    const firstProcess = new ChatAttachmentContract(storage);
    const archivedRef = await firstProcess.persist('conversation-42', {
      content: hello(),
      mime: 'image/png',
      alt: 'shot',
    });

    const restartedProcess = new ChatAttachmentContract(storage);
    const resolution = await restartedProcess.resolve(
      JSON.parse(JSON.stringify(archivedRef)) as ChatStoredAttachmentRef,
    );

    expect(resolution.status).toBe('available');
    if (resolution.status !== 'available') throw new Error('Expected attachment to resolve');
    expect(resolution.source).toBe('contract');
    expect(resolution.absolutePath).toBe(`C:/project/${archivedRef.relativePath}`);
    expect(Array.from(resolution.bytes)).toEqual(Array.from(hello()));
    expect(await restartedProcess.absolutePath(archivedRef)).toBe(
      `C:/project/${archivedRef.relativePath}`,
    );
    expect(Array.from((await restartedProcess.bytes(archivedRef)) ?? [])).toEqual(
      Array.from(hello()),
    );
  });

  it('detects content changed behind a durable reference', async () => {
    const storage = new MemoryProjectStorage();
    const contract = new ChatAttachmentContract(storage);
    const ref = await contract.persist('conversation-42', {
      content: hello(),
      mime: 'image/png',
      alt: 'shot',
    });
    storage.seed(ref.relativePath, new Uint8Array([9, 9, 9]));

    const resolution = await contract.resolve(ref);

    expect(resolution.status).toBe('unavailable');
    if (resolution.status !== 'unavailable')
      throw new Error('Expected attachment to be unavailable');
    expect(resolution.reason).toBe('hash-mismatch');
    expect(resolution.ref).toMatchObject({
      kind: 'unavailable',
      legacyUrl: ref.relativePath,
      reason: 'hash-mismatch',
    });
  });

  it('migrates readable archived relative paths into durable storage', async () => {
    const storage = new MemoryProjectStorage();
    storage.seed('attachments/old-screen.png', hello());
    const contract = new ChatAttachmentContract(storage);

    const migrated = await contract.migrate(
      'conversation-42',
      legacyChatAttachment('attachments/old-screen.png', 'old screen'),
    );

    expect(migrated.kind).toBe('stored');
    if (migrated.kind !== 'stored') throw new Error('Expected legacy attachment to migrate');
    expect(migrated.relativePath).toBe(
      `.coding-agent-chat/conversations/conversation-42/attachments/${HELLO_SHA256}.png`,
    );
    expect(Array.from((await contract.bytes(migrated)) ?? [])).toEqual(Array.from(hello()));
  });

  it('turns missing and unsafe archived paths into explicit unavailable refs', async () => {
    const contract = new ChatAttachmentContract(new MemoryProjectStorage());

    const [missing, unsafe] = await contract.migrateAll('conversation-42', [
      'attachments/deleted.png',
      legacyChatAttachment('../outside.png'),
    ]);

    expect(missing).toMatchObject({
      kind: 'unavailable',
      reason: 'legacy-not-found',
      legacyUrl: 'attachments/deleted.png',
    });
    expect(unsafe).toMatchObject({
      kind: 'unavailable',
      reason: 'unsupported-legacy-reference',
      legacyUrl: '../outside.png',
    });
  });

  it('migrates an archived data URL even though it has no old filesystem path', async () => {
    const contract = new ChatAttachmentContract(new MemoryProjectStorage());

    const migrated = await contract.migrate('conversation-42', {
      alt: 'inline',
      url: 'data:image/png;base64,aGVsbG8=',
    });

    expect(migrated.kind).toBe('stored');
    if (migrated.kind !== 'stored') throw new Error('Expected data URL to migrate');
    expect(migrated.contentHash).toBe(`sha256:${HELLO_SHA256}`);
    expect(migrated.mime).toBe('image/png');
  });
});
