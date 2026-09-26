import { InjectionToken } from '@angular/core';
import type { TurnMetadataOptions } from 'coding-agent-chat/core';

/** Host defaults; an empty object keeps legacy hosts' metadata UI hidden. */
export const CHAT_TURN_METADATA_OPTIONS = new InjectionToken<TurnMetadataOptions>(
  'CHAT_TURN_METADATA_OPTIONS',
  { providedIn: 'root', factory: () => ({}) },
);
