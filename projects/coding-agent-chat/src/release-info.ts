export interface CodingAgentChatReleaseInfo {
  readonly name: 'coding-agent-chat';
  readonly version: string;
  readonly tag: string | null;
  readonly commit: string | null;
  readonly buildTimestamp: string | null;
}

/**
 * Release metadata exported by the package root.
 *
 * The version is the package SemVer. Tag/commit/timestamp are stamped into the
 * built artifact during release publishing so consumers can inspect the exact
 * provenance of the installed package.
 */
export const CODING_AGENT_CHAT_RELEASE_INFO: CodingAgentChatReleaseInfo = {
  name: 'coding-agent-chat',
  version: '0.2.0',
  tag: null,
  commit: null,
  buildTimestamp: null,
};

export function codingAgentChatReleaseLabel(
  info: CodingAgentChatReleaseInfo = CODING_AGENT_CHAT_RELEASE_INFO
): string {
  const pieces = [`${info.name}@${info.version}`];
  if (info.tag !== null) pieces.push(info.tag);
  if (info.commit !== null) pieces.push(info.commit.slice(0, 12));
  return pieces.join(' · ');
}
