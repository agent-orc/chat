#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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

if (!semverPattern.test(effectiveVersion)) {
  fail(`package version ${effectiveVersion} is not valid SemVer`);
}
if (effectiveTag !== `v${effectiveVersion}`) {
  fail(`release tag ${effectiveTag} does not match version ${effectiveVersion} (expected v${effectiveVersion})`);
}
if (!/^[0-9a-f]{40}$/i.test(effectiveCommit)) {
  fail(`build commit ${effectiveCommit} is not a full 40-character git commit`);
}
if (Number.isNaN(Date.parse(effectiveTimestamp))) {
  fail(`build timestamp ${effectiveTimestamp} is not a valid ISO-8601 timestamp`);
}

if (packageJson.version !== effectiveVersion) {
  fail(
    `package version ${packageJson.version} does not match release version ${effectiveVersion}`
  );
}

const releaseInfoPattern =
  /version:\s*(?:"[^"]*"|'[^']*')[\s\S]*?tag:\s*(?:null|"[^"]*")[\s\S]*?commit:\s*(?:null|"[^"]*")[\s\S]*?buildTimestamp:\s*(?:null|"[^"]*")/;
const replacement = [
  `version: ${JSON.stringify(effectiveVersion)}`,
  `tag: ${JSON.stringify(effectiveTag)}`,
  `commit: ${JSON.stringify(effectiveCommit)}`,
  `buildTimestamp: ${JSON.stringify(effectiveTimestamp)}`,
].join(',\n  ');

async function patchReleaseInfo(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.includes('CODING_AGENT_CHAT_RELEASE_INFO')) return false;
  if (!releaseInfoPattern.test(content)) return false;
  const next = content.replace(releaseInfoPattern, replacement);
  if (next !== content) await fs.writeFile(filePath, next);
  return true;
}

let stampedFileCount = 0;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath);
      continue;
    }
    if (entry.isFile() && /\.(mjs|js)$/i.test(entry.name)) {
      if (await patchReleaseInfo(entryPath)) stampedFileCount += 1;
    }
  }
}

await walk(distDir);
if (stampedFileCount === 0) {
  fail('release metadata placeholder was not found in any built JavaScript artifact');
}

// Ask npm for its effective packlist rather than walking dist. npm applies
// package.json "files", .npmignore and its own always-included/excluded rules;
// hashing a filesystem walk would therefore describe files that are not in
// the released tarball. The manifest itself is excluded because a file cannot
// contain its own digest.
async function sha512(filePath) {
  return createHash('sha512').update(await fs.readFile(filePath)).digest('base64');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let packReport;
try {
  packReport = JSON.parse(
    execFileSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: distDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
  );
} catch (error) {
  fail(`could not determine npm publish file list: ${error.message}`);
}
const packedPaths = packReport?.[0]?.files?.map((file) => file.path);
if (!Array.isArray(packedPaths) || packedPaths.length === 0) {
  fail('npm returned an empty or invalid publish file list');
}

const publishFiles = [];
for (const relativePath of packedPaths
  .filter((file) => file !== 'release-manifest.json')
  .sort((a, b) => a.localeCompare(b))) {
  const filePath = path.resolve(distDir, relativePath);
  if (!filePath.startsWith(`${distDir}${path.sep}`)) {
    fail(`npm publish file escapes package directory: ${relativePath}`);
  }
  publishFiles.push({ path: relativePath, sha512: await sha512(filePath) });
}

const manifest = {
  schemaVersion: 1,
  name: packageJson.name,
  version: effectiveVersion,
  tag: effectiveTag,
  commit: effectiveCommit,
  buildTimestamp: effectiveTimestamp,
  integrityAlgorithm: 'sha512',
  files: publishFiles,
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
