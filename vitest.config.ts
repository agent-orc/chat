import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the pure, zero-Angular kernel specs (`core` + the
 * `markdown` utils). They need no Angular TestBed, only a DOM (jsdom) for
 * the markdown sanitiser / task-ref linker.
 *
 * Angular component specs (*.component.spec.ts across all entry points) run
 * through the `@angular/build:unit-test` builder (`npx ng test`), which
 * resolves the `coding-agent-chat/*` self-references — raw vitest cannot,
 * so component specs are excluded here.
 */
export default defineConfig({
  resolve: {
    // Orchestrated Windows worktrees are directory junctions. Keep Vite on
    // the checkout path instead of resolving to a physical path it cannot
    // serve through /@fs/.
    preserveSymlinks: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['projects/coding-agent-chat/{core,markdown}/**/*.spec.ts'],
    exclude: ['**/*.component.spec.ts', '**/node_modules/**'],
  },
});
