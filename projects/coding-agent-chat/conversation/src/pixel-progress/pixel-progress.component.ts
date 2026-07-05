import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';

export type PixelProgressState = 'working' | 'queued';

/**
 * Playful pixel-art progress scene for the conversation's working/queued
 * status row. A tiny canvas diorama instead of a pulse dot:
 *
 * - a stick-figure worker keeps a fetch-and-carry loop going: walk out to a
 *   supply spot, pick up a block, haul it back, place it. Blocks build up
 *   little pixel structures — a pyramid, fence, house, tower, staircase or
 *   arch — one after another across the strip. The growing skyline doubles
 *   as a read-at-a-glance record of how long the agent has been at it.
 * - what gets built reflects the ACTIVE MODEL: a stronger model lays bigger
 *   stones / triangles, a lighter one places small pebbles, and each model
 *   family builds in its own colour — so a mid-task model switch literally
 *   changes the construction material mid-structure.
 * - slow pixel clouds drift across the sky; by day a sun hangs in the
 *   corner (real local time; night is told by its absence), rain passes
 *   through occasionally, and on lucky days a tree grows or a cat/deer
 *   strolls across the strip.
 * - the scene reacts to the cursor: clouds get nudged aside and the worker
 *   waves back. Clicks are aimed: hit a structure to add a block, an animal
 *   to shoo it off, the sun to make it laugh, the worker to spook (or bowl
 *   him over) — anywhere else rains confetti. In queued state the worker
 *   sits and Zzz's drift up until poked awake.
 *
 * Rendering is imperative canvas 2D driven by requestAnimationFrame — no
 * change detection involvement, which keeps the zoneless host quiet. The
 * loop pauses while the strip is scrolled out of view. All colors are
 * resolved from the theme tokens on the host element (and re-resolved
 * periodically so a live theme flip is picked up), never from hard-coded
 * dark literals. `prefers-reduced-motion` skips the loop and re-paints one
 * static frame per state change instead (the preference is watched live).
 * Every browser API is guarded so the component stays inert (but
 * constructible) under jsdom/SSR.
 */
@Component({
  selector: 'cac-pixel-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #scene class="scene" aria-hidden="true" data-testid="pixel-progress-canvas"></canvas>`,
  styleUrl: './pixel-progress.component.scss',
  host: {
    '[attr.data-state]': 'state()',
    'aria-hidden': 'true',
  },
})
export class PixelProgressComponent {
  readonly state = input.required<PixelProgressState>();
  /** Active generating model — drives block size, shape and colour. */
  readonly model = input<string | null>(null);
  /** Active thinking level — a high level flags finished structures. */
  readonly thinking = input<string | null>(null);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('scene');

  private ctx: CanvasRenderingContext2D | null = null;
  private raf: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private readonly aborter = new AbortController();
  private reducedMotion = false;
  /** False while the strip is scrolled out of view — the loop pauses then. */
  private visible = true;

  // ── scene dimensions (grid cells; one cell = PX css pixels) ──────────────
  private cols = 0;
  private rows = 0;
  private cssW = 0;
  private cssH = 0;

  // ── clocks ────────────────────────────────────────────────────────────────
  private t = 0;
  private lastNow = 0;
  private frame = 0;

  // ── palette (resolved from theme tokens on the host) ─────────────────────
  private ink = '#94a3b8';
  private accent = '#d97757';
  private info = '#38bdf8';
  private pending = '#a78bfa';
  private success = '#22c55e';
  private warn = '#f59e0b';

  // ── sky & weather ─────────────────────────────────────────────────────────
  private clouds: Cloud[] = [];
  /** Cloud drift factor, eased between busy (1) and nap-time calm (~0.2). */
  private drift = 1;
  private celestial: 'sun' | 'moon' = 'sun';
  /** While in the future, the sun wears a laughing face (click reward). */
  private celestialLaughUntil = 0;
  private rainUntil = 0;
  private nextRainAt = 0;
  private rainCloudIdx = 0;

  // ── rare guests ───────────────────────────────────────────────────────────
  private tree: { x: number } | null = null;
  private critter: Critter | null = null;
  private nextCritterAt = 0;
  /** While in the future, the shooed critter shows a startled "!". */
  private critterAlarmUntil = 0;

  // ── construction (the growing skyline = elapsed-time gauge) ───────────────
  private structures: Structure[] = [];
  /** The structure the worker is currently hauling a block toward. */
  private building: Structure | null = null;
  private lastKind: BlueprintKind | null = null;

  // ── worker figure ─────────────────────────────────────────────────────────
  private fig = {
    x: 8,
    dir: 1 as 1 | -1,
    action: 'walk' as FigureAction,
    until: 0,
    animT: 0,
    targetX: 22,
    jumpT: -1,
    carrying: false,
    carryColor: 'ink' as string,
    supplyX: 30,
    greetCooldownUntil: 0,
    zzzTimer: 0,
  };
  private particles: Particle[] = [];

  constructor() {
    afterNextRender(() => this.init());
    this.destroyRef.onDestroy(() => this.cleanup());
    effect(() => {
      const state = this.state();
      // Only state() is a real dependency. The imperative work below reaches
      // model() transitively (startFetch → newStructure → buildStyle), so run
      // it untracked — otherwise a model switch would spuriously re-fire this
      // state effect. The rAF loop reads model() live for the actual builds.
      untracked(() => {
        // Transition the story, not just the styling: sit down when queued,
        // get back to work when running again.
        if (state === 'queued') {
          if (this.fig.action !== 'sit' && this.fig.action !== 'startle') {
            this.fig.action = 'sit';
            this.fig.carrying = false;
            this.fig.zzzTimer = 0.4;
          }
        } else if (this.fig.action === 'sit' || this.fig.action === 'startle') {
          this.startFetch();
        }
        // Under reduced motion there is no loop — repaint the one static
        // frame here so a state flip (and its palette) is never left stale.
        if (this.reducedMotion && this.ctx) {
          this.resolvePalette();
          this.drawStaticFrame();
        }
      });
    });
    // Reduced-motion only: the static frame's build material depends on the
    // model, and the state effect above no longer tracks model(). Watch it
    // (and thinking) here so a mid-run model switch re-inks the snapshot.
    effect(() => {
      this.model();
      this.thinking();
      untracked(() => {
        if (this.reducedMotion && this.ctx) {
          this.resolvePalette();
          this.drawStaticFrame();
        }
      });
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  private init(): void {
    if (typeof window === 'undefined') return;
    const canvas = this.canvasRef().nativeElement;
    try {
      this.ctx = canvas.getContext('2d');
    } catch {
      this.ctx = null; // jsdom / test environments without 2D canvas
    }
    if (!this.ctx) return;

    if (typeof matchMedia !== 'undefined') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = query.matches;
      query.addEventListener?.(
        'change',
        (event) => this.onMotionPreferenceChange(event.matches),
        { signal: this.aborter.signal },
      );
    }

    this.resolvePalette();
    this.measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.measure();
        if (this.reducedMotion) {
          this.resolvePalette();
          this.drawStaticFrame();
        }
      });
      this.resizeObserver.observe(this.host.nativeElement);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        if (!this.visible) this.stopLoop();
        else if (!this.reducedMotion) this.startLoop();
      });
      this.intersectionObserver.observe(this.host.nativeElement);
    }

    // Listeners are attached unconditionally; the handlers themselves stay
    // inert under reduced motion so a live preference flip needs no rewiring.
    const opts = { signal: this.aborter.signal, passive: true } as const;
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), opts);
    canvas.addEventListener('pointerleave', () => (this.cursor = null), opts);
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts);

    this.seedScene();
    if (this.reducedMotion) {
      this.drawStaticFrame();
      return;
    }
    this.startLoop();
  }

  private startLoop(): void {
    if (this.raf !== null || !this.ctx || typeof requestAnimationFrame === 'undefined') return;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.raf !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.raf);
    }
    this.raf = null;
  }

  private onMotionPreferenceChange(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.stopLoop();
      this.resolvePalette();
      this.drawStaticFrame();
    } else if (this.visible) {
      this.startLoop();
    }
  }

  private cleanup(): void {
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.aborter.abort();
  }

  private measure(): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.cssW = Math.max(0, rect.width);
    this.cssH = Math.max(0, rect.height);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(this.cssW * dpr);
    canvas.height = Math.round(this.cssH * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cols = Math.floor(this.cssW / PX);
    this.rows = Math.floor(this.cssH / PX);
    // Keep story actors inside the (possibly narrower) new stage.
    const maxX = Math.max(4, this.cols - 5);
    this.fig.x = Math.min(this.fig.x, maxX);
    this.fig.targetX = Math.min(this.fig.targetX, maxX);
    // Drop any structures that no longer fit the resized strip.
    this.structures = this.structures.filter(
      (s) => s.baseX >= 1 && s.baseX + s.width * s.unit <= this.cols - 1,
    );
    if (this.building && !this.structures.includes(this.building)) this.building = null;
    if (this.tree && (this.tree.x < 2 || this.tree.x > this.cols - 4)) this.tree = null;
  }

  /**
   * Colors come from the SAME custom properties the rest of the library
   * uses, with the same fallbacks — resolved at runtime because canvas
   * cannot consume CSS variables directly. Re-resolved every ~90 frames so
   * a live `data-studio-theme` flip re-inks the scene without a rebuild.
   */
  private resolvePalette(): void {
    if (typeof getComputedStyle === 'undefined') return;
    const style = getComputedStyle(this.host.nativeElement);
    const read = (name: string, fallback: string): string => {
      const value = style.getPropertyValue(name).trim();
      return value.length > 0 ? value : fallback;
    };
    this.ink = style.color || this.ink;
    this.accent = read('--studio-accent', '#d97757');
    this.info = read('--severity-info', '#38bdf8');
    this.pending = read('--severity-pending', '#a78bfa');
    this.success = read('--studio-accent-success', '#22c55e');
    this.warn = read('--studio-accent-warn', '#f59e0b');
  }

  private paletteColor(key: string): string {
    switch (key) {
      case 'accent': return this.accent;
      case 'info': return this.info;
      case 'pending': return this.pending;
      case 'success': return this.success;
      case 'warn': return this.warn;
      default: return this.ink;
    }
  }

  /** Block size / shape / colour for the currently active model. */
  private buildStyle(): BuildStyle {
    return styleForModel(this.model());
  }

  private seedScene(): void {
    this.structures = [];
    this.building = null;
    this.lastKind = null;
    if (this.cols > 12) {
      // Start with one partly-built structure so the skyline is never empty
      // and the elapsed-time gauge starts a little above zero.
      const s = this.newStructure();
      if (s) {
        const pre = Math.max(1, Math.floor(s.cells.length * 0.3));
        for (let i = 0; i < pre; i++) this.placeBlock(s, true);
      }
    }
    this.seedClouds();
    this.celestial = this.currentCelestial();
    this.nextRainAt = this.t + 25 + Math.random() * 70;
    this.nextCritterAt = this.t + 18 + Math.random() * 50;
    this.tree = null;
    if (this.cols > 40 && Math.random() < 0.3) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = 3 + Math.floor(Math.random() * (this.cols - 8));
        if (!this.overlapsStructure(x)) {
          this.tree = { x };
          break;
        }
      }
    }
    this.fig.x = Math.min(8, Math.max(2, this.cols - 4));
    this.fig.carrying = false;
    if (this.state() === 'queued') {
      this.fig.action = 'sit';
    } else {
      this.startFetch();
    }
  }

  private overlapsStructure(x: number): boolean {
    return this.structures.some((s) => x >= s.baseX - 2 && x <= s.baseX + s.width * s.unit + 1);
  }

  private seedClouds(): void {
    const count = Math.max(2, Math.min(5, Math.floor(this.cols / 26)));
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      this.clouds.push({
        x: Math.random() * this.cols,
        y: 1 + (i % 3),
        w: 6 + Math.floor(Math.random() * 4),
        speed: 0.7 + Math.random() * 1.1,
      });
    }
  }

  /** Sun from 06:00 to 17:59 local time; night is drawn as an empty sky. */
  private currentCelestial(): 'sun' | 'moon' {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? 'sun' : 'moon';
  }

  // ── input events ──────────────────────────────────────────────────────────

  private cursor: { x: number; y: number } | null = null;

  private onPointerMove(event: PointerEvent): void {
    if (this.reducedMotion) return;
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    this.cursor = {
      x: (event.clientX - rect.left) / PX,
      y: (event.clientY - rect.top) / PX,
    };
  }

  /**
   * Clicks are aimed. Hit-test in order of how small/precious the target
   * is: worker → critter → sun → structure → plain confetti.
   */
  private onPointerDown(event: PointerEvent): void {
    if (this.reducedMotion) return;
    this.onPointerMove(event);
    const at = this.cursor ?? { x: this.fig.x, y: this.rows / 2 };
    const feet = this.feetRow();

    // The worker: spook him — or bowl him clean over.
    if (Math.abs(at.x - this.fig.x) <= 3 && at.y >= feet - 7 && this.fig.action !== 'tumble') {
      this.fig.carrying = false;
      if (Math.random() < 0.55) {
        this.fig.action = 'startle';
        this.fig.until = this.t + 0.9;
        if (this.fig.jumpT < 0) this.fig.jumpT = 0; // jumps out of his skin
      } else {
        this.fig.action = 'tumble';
        this.fig.until = this.t + 1.5;
      }
      return;
    }

    // The critter: shoo it away — it bolts off the strip.
    if (this.critter && Math.abs(at.x - this.critter.x) <= 3.5 && at.y >= feet - 5) {
      this.critter.fleeing = true;
      this.critter.dir = at.x >= this.critter.x ? -1 : 1;
      this.critter.speed = 14;
      this.critterAlarmUntil = this.t + 0.7;
      return;
    }

    // The sun: tickle it into a laugh. (At night the sky is empty — nothing
    // to tickle, so the click falls through to confetti.)
    const sky = this.celestialPos();
    if (this.celestial === 'sun' && Math.abs(at.x - (sky.x + 1)) <= 3 && at.y <= sky.y + 3.5) {
      this.celestialLaughUntil = this.t + 2.2;
      return;
    }

    // A structure under construction: add a block of your own.
    const wip = this.inProgressStructure();
    if (wip && at.x >= wip.baseX - 2 && at.x <= wip.baseX + wip.width * wip.unit + 1 && at.y >= feet - this.structureHeight(wip) - 2) {
      if (this.placeBlock(wip)) return;
    }

    // Open air: confetti, plus a wake-up poke for the sleeper.
    this.burstConfetti(at.x, at.y);
    if (this.state() === 'queued' && this.fig.action === 'sit') {
      this.fig.action = 'startle';
      this.fig.until = this.t + 0.9;
    }
  }

  // ── main loop ─────────────────────────────────────────────────────────────

  private readonly tick = (now: number): void => {
    this.raf = null;
    if (this.reducedMotion || !this.visible) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.t += dt;
    this.frame += 1;
    if (this.frame % 90 === 0) this.resolvePalette();
    if (this.frame % 3600 === 0) this.celestial = this.currentCelestial();
    if (!this.ctx || this.cols < 8 || this.rows < 10) return;

    // Cloud drift eases between busy (working) and nap-time calm (queued).
    const targetDrift = this.state() === 'working' ? 1 : 0.22;
    this.drift += (targetDrift - this.drift) * Math.min(1, dt * 2);

    this.updateClouds(dt);
    this.updateWeather();
    this.updateCritter(dt);
    this.updateFigure(dt);
    this.updateParticles(dt);
    this.draw();
  };

  private updateClouds(dt: number): void {
    if (this.clouds.length === 0 && this.cols > 12) this.seedClouds();
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * this.drift * dt;
      // A nearby cursor gently shoos the cloud aside.
      if (this.cursor && this.cursor.y < 8) {
        const dx = cloud.x + cloud.w / 2 - this.cursor.x;
        if (Math.abs(dx) < 8) cloud.x += Math.sign(dx || 1) * 3 * dt;
      }
      if (cloud.x > this.cols + 2) cloud.x = -cloud.w - 2;
      if (cloud.x < -cloud.w - 4) cloud.x = this.cols + 1;
    }
  }

  /** Occasional short rain shower out of one cloud — rare on purpose. */
  private updateWeather(): void {
    if (this.clouds.length === 0) return;
    if (this.t >= this.nextRainAt && this.t >= this.rainUntil) {
      this.rainUntil = this.t + 4 + Math.random() * 5;
      this.rainCloudIdx = Math.floor(Math.random() * this.clouds.length);
      this.nextRainAt = this.rainUntil + 50 + Math.random() * 90;
    }
    if (this.t < this.rainUntil) {
      const cloud = this.clouds[this.rainCloudIdx % this.clouds.length];
      // A couple of fresh drops per frame, spread across the cloud width.
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.7) {
          const x = cloud.x + Math.random() * cloud.w;
          const y = cloud.y + 2;
          const fall = Math.max(1, this.rows - 2 - y);
          this.particles.push({
            x, y,
            vx: 0.4 * this.drift,
            vy: RAIN_SPEED,
            ttl: fall / RAIN_SPEED,
            life: 0,
            color: this.info,
            kind: 'drop',
          });
        }
      }
    }
  }

  /** Rarely, a cat or deer strolls across the strip. */
  private updateCritter(dt: number): void {
    if (this.critter === null) {
      if (this.t >= this.nextCritterAt && this.cols > 30) {
        const fromLeft = Math.random() < 0.5;
        const kind: CritterKind = Math.random() < 0.55 ? 'cat' : 'deer';
        this.critter = {
          kind,
          x: fromLeft ? -4 : this.cols + 4,
          dir: fromLeft ? 1 : -1,
          speed: kind === 'cat' ? 3.2 : 4.8,
        };
      }
      return;
    }
    // A shooed critter bolts at full speed regardless of scene calm.
    const pace = this.critter.fleeing ? 1 : this.drift;
    this.critter.x += this.critter.dir * this.critter.speed * pace * dt;
    if (this.critter.x < -6 || this.critter.x > this.cols + 6) {
      this.critter = null;
      this.nextCritterAt = this.t + 60 + Math.random() * 130;
    }
  }

  // ── construction ───────────────────────────────────────────────────────────

  /** The structure still being built (last one, if unfinished). */
  private inProgressStructure(): Structure | null {
    const last = this.structures[this.structures.length - 1];
    return last && last.filled < last.cells.length ? last : null;
  }

  /** In-progress structure, or a freshly sited new one, or null if no room. */
  private activeStructure(): Structure | null {
    return this.inProgressStructure() ?? this.newStructure();
  }

  /** Height in cells of the tallest column of a structure. */
  private structureHeight(s: Structure): number {
    let top = 0;
    for (const c of s.cells) top = Math.max(top, c.dy + 1);
    return top * s.unit;
  }

  /** Site a new structure at a free plot, its size/shape from the model. */
  private newStructure(): Structure | null {
    const style = this.buildStyle();
    const unit = style.unit;
    const feet = this.feetRow();
    const maxRows = Math.max(2, Math.floor((feet - 3) / unit));
    const maxWidth = Math.max(3, Math.min(7, Math.floor((this.cols - 2) / unit)));
    if (maxWidth < 2) return null;
    const kind = this.pickBlueprintKind();
    const bp = buildBlueprint(kind, maxRows, maxWidth);
    const span = bp.width * unit;

    // Candidate base columns with a 1-cell gap from edges and other builds.
    const occupied = this.structures.map((s) => [s.baseX - 1, s.baseX + s.width * s.unit] as const);
    const candidates: number[] = [];
    for (let bx = 1; bx + span <= this.cols - 1; bx++) {
      const lo = bx, hi = bx + span;
      if (!occupied.some(([a, b]) => !(hi < a || lo > b))) candidates.push(bx);
    }
    if (candidates.length === 0) return null;

    this.lastKind = kind;
    const structure: Structure = {
      baseX: candidates[Math.floor(Math.random() * candidates.length)],
      unit,
      width: bp.width,
      kind,
      cells: bp.cells,
      filled: 0,
      placed: [],
    };
    this.structures.push(structure);
    return structure;
  }

  private pickBlueprintKind(): BlueprintKind {
    const pool = BLUEPRINT_KINDS.filter((k) => k !== this.lastKind);
    return pool[Math.floor(Math.random() * pool.length)] ?? BLUEPRINT_KINDS[0];
  }

  /** Lay the next blueprint block, in the ACTIVE model's material. */
  private placeBlock(s: Structure, silent = false): boolean {
    if (s.filled >= s.cells.length) return false;
    const cell = s.cells[s.filled];
    const style = this.buildStyle();
    // The structure's slot size is fixed at siting; only clamp the motif so a
    // 1-cell slot never gets a 2-cell brush and vice-versa.
    let brush = style.brush;
    if (s.unit === 1) brush = 'dot';
    else if (brush === 'dot') brush = 'brick';
    s.placed.push({ dx: cell.dx, dy: cell.dy, brush, color: style.color, at: silent ? -10 : this.t });
    s.filled += 1;
    if (!silent) {
      const gx = s.baseX + cell.dx * s.unit;
      const gy = this.feetRow() - (cell.dy + 1) * s.unit + 1;
      this.burstSparks(gx + s.unit / 2, gy);
    }
    return true;
  }

  /** Head out to a fresh supply spot (empty-handed). */
  private startFetch(): void {
    const fig = this.fig;
    fig.carrying = false;
    // Nothing left to build (strip packed) → idle proudly on the spot.
    const target = this.activeStructure();
    if (target === null) {
      fig.action = 'celebrate';
      fig.until = this.t + 2;
      return;
    }
    // A supply spot away from the structure being built.
    const center = target.baseX + (target.width * target.unit) / 2;
    const min = 2;
    const max = Math.max(min + 1, this.cols - 4);
    let supply = min + Math.random() * (max - min);
    for (let attempt = 0; attempt < 5 && Math.abs(supply - center) < 8; attempt++) {
      supply = min + Math.random() * (max - min);
    }
    fig.supplyX = supply;
    fig.action = 'walk';
    fig.targetX = supply;
    fig.dir = supply >= fig.x ? 1 : -1;
  }

  /** Haul the block back to the structure's next slot. */
  private startHaul(): void {
    const fig = this.fig;
    const s = this.activeStructure();
    if (s === null) {
      fig.carrying = false;
      fig.action = 'celebrate';
      fig.until = this.t + 1.6;
      this.building = null;
      return;
    }
    this.building = s;
    fig.carrying = true;
    fig.carryColor = this.buildStyle().color;
    const cell = s.cells[Math.min(s.filled, s.cells.length - 1)];
    const blockX = s.baseX + cell.dx * s.unit;
    const side = fig.x <= blockX ? -1 : 1;
    fig.targetX = blockX + (side === -1 ? -1 : s.unit + 1);
    fig.dir = fig.targetX >= fig.x ? 1 : -1;
    // Back on the move toward the structure — WITHOUT this the caller ('pickup')
    // would re-enter startHaul() every frame and the block never gets hauled.
    fig.action = 'walk';
  }

  private updateFigure(dt: number): void {
    const fig = this.fig;
    fig.animT += dt;

    // Jump arc runs independently of the current action.
    if (fig.jumpT >= 0) {
      fig.jumpT += dt;
      if (fig.jumpT > JUMP_DURATION) fig.jumpT = -1;
    }

    // Cursor greeting: pause the errand and wave back, then a cooldown so
    // the worker eventually returns to work even under a lingering cursor.
    // Never mid-carry — the block would vanish with the wave.
    if (
      this.state() === 'working' &&
      this.cursor !== null &&
      !fig.carrying &&
      (fig.action === 'walk' || fig.action === 'think') &&
      Math.abs(this.cursor.x - fig.x) < 12 &&
      this.t > fig.greetCooldownUntil
    ) {
      fig.action = 'greet';
      fig.until = this.t + 2.2;
      fig.dir = this.cursor.x >= fig.x ? 1 : -1;
    }

    switch (fig.action) {
      case 'walk': {
        fig.x += fig.dir * WALK_SPEED * dt;
        const arrived = (fig.dir === 1 && fig.x >= fig.targetX) || (fig.dir === -1 && fig.x <= fig.targetX);
        if (arrived) {
          if (fig.carrying) {
            fig.action = 'place';
            fig.until = this.t + 0.65;
            const s = this.building;
            if (s) fig.dir = s.baseX + (s.width * s.unit) / 2 >= fig.x ? 1 : -1;
          } else {
            fig.action = 'pickup';
            fig.until = this.t + 0.55;
          }
        }
        break;
      }
      case 'pickup': {
        if (this.t >= fig.until) this.startHaul();
        break;
      }
      case 'place': {
        if (this.t >= fig.until) {
          const s = this.building;
          const placed = s ? this.placeBlock(s) : false;
          fig.carrying = false;
          const complete = !s || s.filled >= s.cells.length;
          if (complete) this.building = null;
          const roll = Math.random();
          if (!placed || (complete && s)) {
            // Finished a structure — a little victory, then on to the next.
            fig.action = 'celebrate';
            fig.until = this.t + 1.4;
            if (placed) this.burstConfetti(fig.x, this.feetRow() - 6);
          } else if (roll < 0.22) {
            fig.action = 'think';
            fig.until = this.t + 1.2;
          } else {
            this.startFetch();
          }
        }
        break;
      }
      case 'celebrate':
      case 'think': {
        if (this.t >= fig.until) this.startFetch();
        break;
      }
      case 'greet': {
        const gone = this.cursor === null || Math.abs(this.cursor.x - fig.x) >= 14;
        if (gone || this.t >= fig.until) {
          fig.greetCooldownUntil = this.t + 4;
          this.startFetch();
        } else if (this.cursor) {
          fig.dir = this.cursor.x >= fig.x ? 1 : -1;
        }
        break;
      }
      case 'sit': {
        fig.zzzTimer -= dt;
        if (fig.zzzTimer <= 0) {
          fig.zzzTimer = 1.6 + Math.random() * 0.6;
          this.spawnZzz(fig.x + 1.5, this.feetRow() - 5);
        }
        break;
      }
      case 'startle': {
        if (this.t >= fig.until) {
          if (this.state() === 'queued') {
            fig.action = 'sit';
            fig.zzzTimer = 1.2;
          } else {
            this.startFetch();
          }
        }
        break;
      }
      case 'tumble': {
        if (this.t >= fig.until) {
          if (this.state() === 'queued') {
            fig.action = 'sit';
            fig.zzzTimer = 1.2;
          } else {
            // Back on his feet with a short recollecting pause.
            fig.action = 'think';
            fig.until = this.t + 0.8;
          }
        }
        break;
      }
    }
  }

  // ── particles ─────────────────────────────────────────────────────────────

  private burstSparks(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: -4 - Math.random() * 6,
        ttl: 0.3 + Math.random() * 0.15,
        life: 0,
        color: Math.random() < 0.5 ? this.warn : this.accent,
        kind: 'px',
      });
    }
  }

  private burstConfetti(x: number, y: number): void {
    const colors = [this.accent, this.info, this.success, this.warn, this.pending];
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 16,
        vy: -6 - Math.random() * 9,
        ttl: 0.8 + Math.random() * 0.6,
        life: 0,
        color: colors[i % colors.length],
        kind: 'px',
      });
    }
  }

  private spawnZzz(x: number, y: number): void {
    this.particles.push({ x, y, vx: 1.2, vy: -2.2, ttl: 1.8, life: 0, color: this.pending, kind: 'z' });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.vy += (p.kind === 'px' ? GRAVITY : 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.ttl);
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  private feetRow(): number {
    return this.rows - 3;
  }

  private cell(x: number, y: number, color: string, alpha: number): void {
    if (!this.ctx) return;
    const cx = Math.round(x);
    const cy = Math.round(y);
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(cx * PX, cy * PX, PX - 1, PX - 1);
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const groundRow = this.rows - 2;
    const working = this.state() === 'working';

    // Ground: a dotted dim baseline with small gaps for texture.
    for (let x = 0; x < this.cols; x++) {
      if (x % 9 === 4) continue;
      this.cell(x, groundRow, this.ink, 0.18);
    }

    this.drawCelestial();

    // Sky: soft pixel clouds, tinted by the status color. The raining
    // cloud goes heavy and gray for its shower.
    const skyColor = working ? this.info : this.pending;
    const raining = this.t < this.rainUntil;
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const isRainCloud = raining && i === this.rainCloudIdx % this.clouds.length;
      const color = isRainCloud ? this.ink : skyColor;
      const baseAlpha = isRainCloud ? 0.42 : 0.3;
      for (let k = 0; k < cloud.w; k++) {
        this.cell(cloud.x + k, cloud.y + 1, color, baseAlpha);
      }
      for (let k = 1; k < cloud.w - 1; k++) {
        this.cell(cloud.x + k, cloud.y, color, baseAlpha * 0.55);
      }
    }

    this.drawTree();
    this.drawStructures();
    this.drawCritter();

    // Supply block: visible at the spot while the worker is picking it up,
    // in the active model's build colour.
    if (this.fig.action === 'pickup') {
      this.cell(this.fig.supplyX + this.fig.dir, this.feetRow(), this.paletteColor(this.buildStyle().color), 0.8);
    }

    this.drawFigure();

    // Particles on top of everything.
    for (const p of this.particles) {
      const fade = 1 - p.life / p.ttl;
      if (p.kind === 'z') {
        this.drawZzz(p.x, p.y, Math.max(0.12, fade * 0.8));
      } else if (p.kind === 'drop') {
        this.cell(p.x, p.y, p.color, Math.max(0.15, fade * 0.5));
      } else {
        this.cell(p.x, p.y, p.color, Math.max(0.1, fade));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Fixed sky spot for the sun: the top-right corner. */
  private celestialPos(): { x: number; y: number } {
    return { x: this.cols - 10, y: 1 };
  }

  /**
   * Sun by day (06–18 local); a click makes it laugh for a bit. At night
   * the sky simply stays empty — pixel moons and lone star specks both
   * read as stray artifacts at this scale, so night is told by absence.
   */
  private drawCelestial(): void {
    if (this.celestial !== 'sun') return;
    const { x, y: baseY } = this.celestialPos();
    const laughing = this.t < this.celestialLaughUntil;
    // A laughing sun bounces with joy.
    const y = laughing ? baseY - Math.abs(Math.sin(this.t * 8)) * 0.8 : baseY;
    // A chunky 3×3 disc with softened corners, plus a full ray crown —
    // unmistakably a sun even at 3px cells.
    const glow = 0.85 + 0.1 * Math.sin(this.t * 1.1);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const corner = (dx === 0 || dx === 2) && (dy === 0 || dy === 2);
        this.cell(x + dx, y + dy, this.warn, corner ? glow * 0.55 : glow);
      }
    }
    const ray = 0.45 + 0.2 * Math.sin(this.t * 1.1 + 1);
    this.cell(x - 2, y + 1, this.warn, ray);        // W
    this.cell(x + 4, y + 1, this.warn, ray);        // E
    this.cell(x + 1, y - 1.6, this.warn, ray);      // N (clipped at top edge is fine)
    this.cell(x + 1, y + 3.6, this.warn, ray);      // S
    this.cell(x - 1.4, y - 1, this.warn, ray * 0.7);  // NW
    this.cell(x + 3.4, y - 1, this.warn, ray * 0.7);  // NE
    this.cell(x - 1.4, y + 3, this.warn, ray * 0.7);  // SW
    this.cell(x + 3.4, y + 3, this.warn, ray * 0.7);  // SE
    if (laughing) {
      // Squinted-with-joy eyes and an open smile on the disc.
      this.cell(x, y + 0.6, this.ink, 0.85);
      this.cell(x + 2, y + 0.6, this.ink, 0.85);
      this.cell(x + 1, y + 2, this.ink, 0.8);
    }
  }

  private drawTree(): void {
    if (!this.tree) return;
    const x = this.tree.x;
    const feet = this.feetRow();
    this.cell(x, feet, this.ink, 0.5);
    this.cell(x, feet - 1, this.ink, 0.5);
    // Canopy sways just a whisker in the breeze.
    const sway = Math.round(Math.sin(this.t * 0.8) * 0.4);
    this.cell(x - 1 + sway, feet - 2, this.success, 0.55);
    this.cell(x + sway, feet - 2, this.success, 0.7);
    this.cell(x + 1 + sway, feet - 2, this.success, 0.55);
    this.cell(x - 0.5 + sway, feet - 3, this.success, 0.6);
    this.cell(x + 0.5 + sway, feet - 3, this.success, 0.6);
    this.cell(x + sway, feet - 4, this.success, 0.45);
  }

  private drawStructures(): void {
    const feet = this.feetRow();
    const thinkingHigh = /high|max|xhigh/i.test(this.thinking() ?? '');
    for (const s of this.structures) {
      for (const b of s.placed) {
        const gx = s.baseX + b.dx * s.unit;
        const gy = feet - (b.dy + 1) * s.unit + 1;
        const flash = this.t - b.at < 0.6 ? 0.45 * (1 - (this.t - b.at) / 0.6) : 0;
        this.drawBlock(gx, gy, s.unit, b.brush, this.paletteColor(b.color), flash);
      }
      // A finished structure built under high thinking flies a little flag.
      if (thinkingHigh && s.filled >= s.cells.length && s.placed.length > 0) {
        const apex = this.structureApex(s);
        this.cell(apex.x, apex.y - 1, this.accent, 0.85);
        this.cell(apex.x + 1, apex.y - 1, this.accent, 0.5);
      }
    }
  }

  /** Draw one build block: motif + size vary by brush; colour by model. */
  private drawBlock(gx: number, gy: number, unit: number, brush: Brush, color: string, flash: number): void {
    const a = (c: number): number => Math.min(1, c + flash);
    if (unit === 1) {
      this.cell(gx, gy, color, a(0.82));
      return;
    }
    // 2×2 slot: the motif reads the model tier.
    switch (brush) {
      case 'brick': {
        // Offset masonry: alternating cell weight suggests staggered bricks.
        this.cell(gx, gy, color, a(0.7));
        this.cell(gx + 1, gy, color, a(0.85));
        this.cell(gx, gy + 1, color, a(0.85));
        this.cell(gx + 1, gy + 1, color, a(0.7));
        break;
      }
      case 'stone': {
        // A rounded boulder: lighter top corners, solid base.
        this.cell(gx, gy, color, a(0.55));
        this.cell(gx + 1, gy, color, a(0.55));
        this.cell(gx, gy + 1, color, a(0.88));
        this.cell(gx + 1, gy + 1, color, a(0.88));
        break;
      }
      case 'triangle': {
        // A chiselled peak: full base + one alternating top cell → a ridge
        // of little pyramids reads across a row of strong-model blocks.
        this.cell(gx, gy + 1, color, a(0.88));
        this.cell(gx + 1, gy + 1, color, a(0.88));
        const left = ((gx + gy) & 2) === 0;
        this.cell(left ? gx : gx + 1, gy, color, a(0.88));
        break;
      }
      default: {
        this.cell(gx, gy + 1, color, a(0.85));
        this.cell(gx + 1, gy + 1, color, a(0.85));
      }
    }
  }

  private structureApex(s: Structure): { x: number; y: number } {
    let topDy = 0;
    let topDx = Math.floor(s.width / 2);
    for (const b of s.placed) {
      if (b.dy > topDy) {
        topDy = b.dy;
        topDx = b.dx;
      }
    }
    return { x: s.baseX + topDx * s.unit, y: this.feetRow() - (topDy + 1) * s.unit + 1 };
  }

  private drawCritter(): void {
    const c = this.critter;
    if (!c) return;
    const feet = this.feetRow();
    const step = Math.sin(this.t * (c.fleeing ? 16 : 8)) > 0 ? 1 : 0;
    const at = (dx: number, dy: number, color: string, alpha: number): void =>
      this.cell(c.x + dx * c.dir, feet - dy, color, alpha);
    if (this.t < this.critterAlarmUntil) {
      this.cell(c.x, feet - 5, this.warn, 0.9); // startled "!"
      this.cell(c.x, feet - 6, this.warn, 0.9);
    }
    if (c.kind === 'cat') {
      at(0, 0, this.ink, 0.75); // body
      at(1, 0, this.ink, 0.75);
      at(2, 1, this.ink, 0.75); // head
      at(2, 2, this.ink, 0.45); // ears
      at(-1, 1 + step, this.ink, 0.6); // tail flicks
    } else {
      at(0, 1, this.accent, 0.7); // body
      at(1, 1, this.accent, 0.7);
      at(step === 0 ? 0 : 1, 0, this.accent, 0.6); // legs alternate
      at(2, 2, this.accent, 0.7); // neck
      at(2, 3, this.accent, 0.75); // head
      at(3, 3.5, this.accent, 0.4); // muzzle up
      at(-1, 1.5, this.accent, 0.45); // tail
    }
  }

  /** Tiny 3×3 pixel "Z". */
  private drawZzz(x: number, y: number, alpha: number): void {
    for (let i = 0; i < 3; i++) this.cell(x + i, y, this.pending, alpha);
    this.cell(x + 1, y + 1, this.pending, alpha);
    for (let i = 0; i < 3; i++) this.cell(x + i, y + 2, this.pending, alpha);
  }

  private drawFigure(): void {
    const fig = this.fig;
    const feet = this.feetRow();
    const ink = this.ink;
    const alpha = 0.92;

    // Jump: a small parabola lifts the whole figure.
    let lift = 0;
    if (fig.jumpT >= 0) {
      const k = fig.jumpT / JUMP_DURATION;
      lift = Math.round(4 * 3 * k * (1 - k)); // peak 3 cells
    }

    const at = (dx: number, dy: number, color = ink, a = alpha): void =>
      this.cell(fig.x + dx * fig.dir, feet - dy - lift, color, a);
    const carry = this.paletteColor(fig.carryColor);

    if (fig.action === 'sit') {
      // Napping: compact pose, head nodding slowly.
      const nod = Math.sin(this.t * 1.2) > 0 ? 0 : -1;
      at(0, 2 + nod); // head
      at(0, 1);       // body
      at(-1, 0); at(0, 0); at(1, 0); // folded legs
      return;
    }

    if (fig.action === 'pickup') {
      // Bent over the supply block.
      at(0, 3); // head, lowered
      at(0, 2); at(0, 1); // hunched body
      at(1, 1); at(1, 0); // arms reaching down
      at(0, 0); // feet
      return;
    }

    if (fig.action === 'tumble') {
      // Bowled over: flat on the ground, legs kicking, seeing stars.
      const kick = Math.sin(this.t * 10) > 0 ? 1 : 0;
      at(0, 0); at(1, 0); at(2, 0); // body lying flat
      at(2, 1); // head, propped up
      at(-1, kick); // legs kicking
      this.cell(fig.x + fig.dir * 2, feet - 3, this.warn, 0.4 + 0.4 * Math.sin(this.t * 6));
      this.cell(fig.x + fig.dir * 3, feet - 4, this.warn, 0.4 + 0.4 * Math.sin(this.t * 6 + 2));
      return;
    }

    const stride = Math.sin(this.t * 9);
    const bob = fig.action === 'walk' && stride > 0 ? 1 : 0;

    // Head + torso (all standing poses share them) — a compact 5-cell frame.
    at(0, 4 + bob);
    at(0, 3 + bob);
    at(0, 2 + bob);

    // The carried block rides above the head, in its build colour.
    if (fig.carrying) {
      at(0, 5 + bob, carry, 0.9);
    }

    // Legs.
    if (fig.action === 'walk' && stride > 0) {
      at(-1, 0); at(0, 1); at(1, 0); // spread stride
    } else {
      at(0, 1); at(0, 0); // standing / together
    }

    // Arms + action garnish.
    switch (fig.action) {
      case 'place': {
        const k = Math.min(1, Math.max(0, (fig.until - this.t) / 0.65));
        // Block swings from overhead down toward the structure as k runs 1 → 0.
        at(1, 3); at(2, 2 + Math.round(k * 2), carry, 0.9);
        at(-1, 2);
        break;
      }
      case 'celebrate': {
        const up = Math.sin(this.t * 10) > 0 ? 1 : 0;
        at(-1, 3 + up); at(1, 3 + up); // both arms pumping
        break;
      }
      case 'greet': {
        const wavePhase = Math.sin(this.t * 8) > 0 ? 1 : 0;
        at(1, 4 + wavePhase); // waving arm toward the cursor
        at(-1, 2);
        break;
      }
      case 'think': {
        at(-1, 2); at(1, 3); // hand near chin
        const dot = Math.floor(this.t * 3) % 3;
        for (let i = 0; i <= dot; i++) this.cell(fig.x + fig.dir * (1 + i), feet - 6 - i, this.ink, 0.5);
        break;
      }
      case 'startle': {
        at(-1, 3); at(1, 3); // arms out
        this.cell(fig.x, feet - 7, this.warn, 0.95); // "!"
        this.cell(fig.x, feet - 8, this.warn, 0.95);
        this.cell(fig.x, feet - 9, this.warn, 0.95);
        break;
      }
      default: {
        if (fig.carrying) {
          at(-1, 4 + bob); at(1, 4 + bob); // both arms up steadying the block
        } else {
          at(-1, 2 + (stride > 0 ? 1 : 0));
          at(1, 2 + (stride > 0 ? 0 : 1));
        }
      }
    }
  }

  /** Reduced motion: one calm, legible frame — no loop, no interaction. */
  private drawStaticFrame(): void {
    if (!this.ctx || this.cols < 8 || this.rows < 10) return;
    this.seedScene();
    this.fig.action = this.state() === 'queued' ? 'sit' : 'walk';
    this.drift = this.state() === 'working' ? 1 : 0.22;
    this.t = 1.2; // fixed phase so the static pose reads well
    this.draw();
  }
}

type FigureAction =
  | 'walk' | 'pickup' | 'place' | 'celebrate' | 'think' | 'greet' | 'sit' | 'startle' | 'tumble';

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

type CritterKind = 'cat' | 'deer';

interface Critter {
  kind: CritterKind;
  x: number;
  dir: 1 | -1;
  speed: number;
  /** Set when the user shoos it — it bolts and ignores the scene's calm. */
  fleeing?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  life: number;
  color: string;
  kind: 'px' | 'z' | 'drop';
}

// ── model → build material ──────────────────────────────────────────────────

type Brush = 'dot' | 'brick' | 'stone' | 'triangle';

interface BuildStyle {
  /** Block footprint in cells: 1 = pebble, 2 = full stone. */
  unit: 1 | 2;
  brush: Brush;
  /** Palette key resolved at draw time (theme-token-aware). */
  color: string;
}

/**
 * Map a model name onto how the worker builds. A stronger model lays bigger
 * blocks (triangles / stones); a lighter one places small pebbles. Each
 * family gets its own colour so a mid-task switch is visible in the wall.
 */
function styleForModel(model: string | null | undefined): BuildStyle {
  const m = (model ?? '').toLowerCase();
  if (!m) return { unit: 1, brush: 'dot', color: 'ink' };
  // Light tier is checked FIRST so a small variant of a strong family
  // (gpt-5-mini, o3-mini, gpt-4o-mini) reads as pebbles, not as the big
  // stones the family catch-all below would otherwise give it.
  if (/haiku|mini|flash|nano|lite|small|8b|1b/.test(m)) {
    return { unit: 1, brush: 'dot', color: 'success' };      // light → pebbles, green
  }
  if (/fable/.test(m)) {
    return { unit: 2, brush: 'stone', color: 'pending' };    // Claude 5 flagship → boulders, purple
  }
  if (/opus|gpt-5|(^|[^a-z])o3|(^|[^a-z])o1|ultra|-max|reason/.test(m)) {
    return { unit: 2, brush: 'triangle', color: 'accent' };  // strong → peaks, orange
  }
  if (/sonnet|gpt-4|gemini.*pro|codex/.test(m)) {
    return { unit: 2, brush: 'brick', color: 'info' };       // mid → bricks, blue
  }
  return { unit: 2, brush: 'brick', color: 'warn' };         // unknown but named → bricks, amber
}

// ── structures & blueprints ─────────────────────────────────────────────────

type BlueprintKind = 'pyramid' | 'house' | 'fence' | 'tower' | 'steps' | 'arch';

const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['pyramid', 'house', 'fence', 'tower', 'steps', 'arch'];

interface BlueprintCell {
  dx: number;
  dy: number;
}

interface PlacedBlock {
  dx: number;
  dy: number;
  brush: Brush;
  color: string;
  /** Placement time, for the landing flash (negative = pre-seeded, no flash). */
  at: number;
}

interface Structure {
  baseX: number;
  /** Block footprint in cells (1 or 2). */
  unit: number;
  /** Blueprint width in units. */
  width: number;
  kind: BlueprintKind;
  cells: BlueprintCell[];
  filled: number;
  placed: PlacedBlock[];
}

/** Build a blueprint's cell list (ordered bottom-up) sized to fit the strip. */
function buildBlueprint(kind: BlueprintKind, maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  let out: { cells: BlueprintCell[]; width: number };
  switch (kind) {
    case 'house': out = bpHouse(maxRows, maxWidth); break;
    case 'fence': out = bpFence(maxRows, maxWidth); break;
    case 'tower': out = bpTower(maxRows, maxWidth); break;
    case 'steps': out = bpSteps(maxRows, maxWidth); break;
    case 'arch': out = bpArch(maxRows, maxWidth); break;
    default: out = bpPyramid(maxRows, maxWidth); break;
  }
  // Build from the ground up, left to right — physically sensible stacking.
  out.cells.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
  return out;
}

function bpPyramid(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  let rows = Math.min(maxRows, 4);
  let base = 2 * rows - 1;
  while (base > maxWidth && rows > 1) {
    rows -= 1;
    base = 2 * rows - 1;
  }
  const cells: BlueprintCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let dx = r; dx <= base - 1 - r; dx++) cells.push({ dx, dy: r });
  }
  return { cells, width: base };
}

function bpHouse(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  if (maxRows < 3) return bpPyramid(maxRows, maxWidth);
  let w = Math.min(maxWidth, 5);
  if (w % 2 === 0) w -= 1;
  w = Math.max(3, w);
  const bodyRows = Math.min(2, maxRows - 1);
  const roofRows = Math.min(Math.ceil(w / 2), maxRows - bodyRows);
  const door = Math.floor(w / 2);
  const cells: BlueprintCell[] = [];
  for (let r = 0; r < bodyRows; r++) {
    for (let dx = 0; dx < w; dx++) {
      if (r === 0 && dx === door) continue; // doorway
      cells.push({ dx, dy: r });
    }
  }
  for (let rr = 0; rr < roofRows; rr++) {
    const lo = rr;
    const hi = w - 1 - rr;
    if (lo > hi) break;
    for (let dx = lo; dx <= hi; dx++) cells.push({ dx, dy: bodyRows + rr });
  }
  return { cells, width: w };
}

function bpFence(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  const w = Math.max(3, Math.min(maxWidth, 7));
  const h = Math.max(2, Math.min(3, maxRows));
  const cells: BlueprintCell[] = [];
  for (let dx = 0; dx < w; dx++) {
    const colH = dx % 2 === 0 ? h : 1; // tall pickets, short gaps
    for (let dy = 0; dy < colH; dy++) cells.push({ dx, dy });
  }
  return { cells, width: w };
}

function bpTower(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  const w = Math.max(2, Math.min(3, maxWidth));
  const h = Math.max(3, maxRows);
  const cells: BlueprintCell[] = [];
  for (let dy = 0; dy < h - 1; dy++) {
    for (let dx = 0; dx < w; dx++) cells.push({ dx, dy });
  }
  for (let dx = 0; dx < w; dx += 2) cells.push({ dx, dy: h - 1 }); // crenellations
  return { cells, width: w };
}

function bpSteps(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  const w = Math.max(2, Math.min(maxWidth, maxRows, 4));
  const cells: BlueprintCell[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy <= dx; dy++) cells.push({ dx, dy });
  }
  return { cells, width: w };
}

function bpArch(maxRows: number, maxWidth: number): { cells: BlueprintCell[]; width: number } {
  if (maxRows < 3) return bpFence(maxRows, maxWidth);
  let w = Math.min(maxWidth, 5);
  if (w % 2 === 0) w -= 1;
  w = Math.max(3, w);
  const h = Math.max(3, Math.min(4, maxRows));
  const mid = Math.floor(w / 2);
  const cells: BlueprintCell[] = [];
  for (let dx = 0; dx < w; dx++) {
    if (dx === mid) {
      cells.push({ dx, dy: h - 1 }); // keystone over the doorway
    } else {
      for (let dy = 0; dy < h; dy++) cells.push({ dx, dy });
    }
  }
  return { cells, width: w };
}

/** Cell size in CSS pixels — the "pixel" of the pixel art. */
const PX = 3;
const WALK_SPEED = 9;
const JUMP_DURATION = 0.5;
const GRAVITY = 22;
const RAIN_SPEED = 15;
