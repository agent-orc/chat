#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    args.set(arg.slice(2), 'true');
  } else {
    args.set(arg.slice(2), next);
    i += 1;
  }
}

function readArg(name, fallback = '') {
  const value = args.get(name);
  return value === undefined || value.length === 0 ? fallback : value;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const repoRoot = path.resolve(readArg('root', process.cwd()));
const distDir = path.resolve(repoRoot, readArg('dist', 'dist/coding-agent-chat'));
const packageJsonPath = path.join(distDir, 'package.json');
const version = readArg('version');
const tag = readArg('tag');
const commit = readArg('commit');
const buildTimestamp = readArg('build-timestamp');

if (!(await exists(packageJsonPath))) {
  fail(`package.json not found in ${distDir}`);
}

const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
const effectiveVersion = version || packageJson.version;
const effectiveTag = tag || `v${effectiveVersion}`;
const effectiveCommit =
  commit || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const effectiveTimestamp =
  buildTimestamp ||
  new Date(
    Number(
      execFileSync('git', ['show', '-s', '--format=%ct', effectiveCommit], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim()
    ) * 1000
  ).toISOString();

if (packageJson.version !== effectiveVersion) {
  fail(
    `package version ${packageJson.version} does not match release version ${effectiveVersion}`
  );
}

const releaseInfoPattern = /tag:\s*null[\s\S]*?commit:\s*null[\s\S]*?buildTimestamp:\s*null/;
const replacement = [
  `tag: ${JSON.stringify(effectiveTag)}`,
  `commit: ${JSON.stringify(effectiveCommit)}`,
  `buildTimestamp: ${JSON.stringify(effectiveTimestamp)}`,
].join(',\n  ');

async function patchReleaseInfo(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.includes('CODING_AGENT_CHAT_RELEASE_INFO')) return false;
  const next = content.replace(releaseInfoPattern, replacement);
  if (next === content) return false;
  await fs.writeFile(filePath, next);
  return true;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath);
      continue;
    }
    if (entry.isFile() && /\.(mjs|js)$/i.test(entry.name)) {
      await patchReleaseInfo(entryPath);
    }
  }
}

await walk(distDir);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cac-release-pack-'));
let packInfo;
try {
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', tempDir],
    {
      cwd: distDir,
      encoding: 'utf8',
    }
  );
  const parsed = JSON.parse(packOutput);
  packInfo = Array.isArray(parsed) ? parsed[0] : parsed;
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

const manifest = {
  name: packageJson.name,
  version: effectiveVersion,
  tag: effectiveTag,
  commit: effectiveCommit,
  buildTimestamp: effectiveTimestamp,
  packageTarball: {
    filename: packInfo?.filename ?? null,
    integrity: packInfo?.integrity ?? null,
    shasum: packInfo?.shasum ?? null,
  },
};

await fs.writeFile(
  path.join(distDir, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(
  `Stamped ${packageJson.name}@${effectiveVersion} (${effectiveTag}, ${effectiveCommit.slice(
    0,
    12
  )})`
);
