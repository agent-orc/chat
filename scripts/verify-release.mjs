#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] || 'dist/coding-agent-chat');
const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(path.join(distDir, 'release-manifest.json'), 'utf8'));
} catch (error) {
  fail(`cannot read release manifest: ${error.message}`);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const report = JSON.parse(
  execFileSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: distDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
);
const packed = report[0].files.map((file) => file.path).filter((file) => file !== 'release-manifest.json');
const recorded = manifest.files.map((file) => file.path);
if (JSON.stringify([...packed].sort()) !== JSON.stringify([...recorded].sort())) {
  fail('manifest file list does not match the npm publish file list');
}

for (const file of manifest.files) {
  const digest = createHash('sha512')
    .update(await fs.readFile(path.join(distDir, file.path)))
    .digest('base64');
  if (digest !== file.sha512) fail(`integrity mismatch: ${file.path}`);
}

console.log(`Verified ${manifest.name}@${manifest.version}: ${manifest.files.length} files`);
