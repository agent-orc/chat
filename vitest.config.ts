import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the pure, zero-Angular kernel (`core` + `markdown` entry
 * points). These specs are the frozen regression net carried over from the
 * host frontend; they need no Angular TestBed, only a DOM (jsdom) for the
 * markdown sanitiser / task-ref linker.
 *
 * Angular component specs (ConversationView, Chat, ...) arrive in a later
 * phase and run through the `@angular/build:unit-test` builder (`ng test`).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['projects/coding-agent-chat/{core,markdown}/**/*.spec.ts'],
  },
});
