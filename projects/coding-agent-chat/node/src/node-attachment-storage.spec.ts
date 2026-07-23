import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ChatAttachmentContract, type ChatStoredAttachmentRef } from '../../core/src/public-api';
import { NodeChatAttachmentStorage } from './node-attachment-storage';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const hello = (): Uint8Array => new TextEncoder().encode('hello');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('NodeChatAttachmentStorage', () => {
  it('persists and resolves a reference with a fresh contract after restart', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'coding-agent-chat-'));
    temporaryRoots.push(projectRoot);

    const firstProcess = new ChatAttachmentContract(new NodeChatAttachmentStorage(projectRoot));
    const archivedRef = await firstProcess.persist('task/CAC-12', {
      content: hello(),
      mime: 'image/png',
      alt: 'clipboard image',
    });

    expect(archivedRef.relativePath).toBe(
      `.coding-agent-chat/conversations/task%2FCAC-12/attachments/${HELLO_SHA256}.png`,
    );
    expect(
      new Uint8Array(
        await readFile(join(projectRoot, ...archivedRef.relativePath.split('/'))),
      ),
    ).toEqual(hello());

    const restartedProcess = new ChatAttachmentContract(
      new NodeChatAttachmentStorage(projectRoot),
    );
    const resolution = await restartedProcess.resolve(
      JSON.parse(JSON.stringify(archivedRef)) as ChatStoredAttachmentRef,
    );

    expect(resolution.status).toBe('available');
    if (resolution.status !== 'available') throw new Error('Expected attachment to resolve');
    expect(resolution.absolutePath).toBe(
      join(projectRoot, ...archivedRef.relativePath.split('/')),
    );
    expect(resolution.bytes).toEqual(hello());
  });

  it('confines direct storage operations to the configured project root', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'coding-agent-chat-'));
    temporaryRoots.push(projectRoot);
    const storage = new NodeChatAttachmentStorage(projectRoot);

    expect(() => storage.absolutePath('../outside.png')).toThrow('project-relative');
    expect(() => storage.absolutePath('attachments\\outside.png')).toThrow('project-relative');
  });
});
