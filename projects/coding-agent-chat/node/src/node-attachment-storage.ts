import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { ChatAttachmentStorage } from 'coding-agent-chat/core';

/**
 * Project-rooted, durable Node.js storage for {@link ChatAttachmentContract}.
 *
 * Writes are flushed to a temporary file in the destination directory and
 * atomically renamed into place. Both contract and legacy reads are confined
 * to `projectRoot`.
 */
export class NodeChatAttachmentStorage implements ChatAttachmentStorage {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    if (!projectRoot.trim()) throw new Error('projectRoot is required');
    this.projectRoot = resolve(projectRoot);
  }

  async write(relativePath: string, bytes: Uint8Array): Promise<void> {
    const destination = this.absolutePath(relativePath);
    const directory = dirname(destination);
    const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    await mkdir(directory, { recursive: true });

    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, destination);
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async read(relativePath: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.absolutePath(relativePath)));
    } catch (error) {
      if (nodeErrorCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  absolutePath(relativePath: string): string {
    if (!safeProjectRelativePath(relativePath)) {
      throw new Error(`Attachment path must be project-relative: ${relativePath}`);
    }
    const absolute = resolve(this.projectRoot, ...relativePath.split('/'));
    const fromRoot = relative(this.projectRoot, absolute);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`Attachment path escapes project root: ${relativePath}`);
    }
    return absolute;
  }
}

function safeProjectRelativePath(path: string): boolean {
  if (!path || path.includes('\0') || path.includes('\\') || isAbsolute(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
