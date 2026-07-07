import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The site's playful sun/moon glyph: a golden sun (ray crown, tiny smile) and
 * a crescent moon (sleepy face, stars) that swap with a springy rotate/scale
 * crossfade (styles live in styles.scss under `.theme-icon`). Shared by the
 * nav toggle and the per-frame preview toggles so the artwork exists once.
 * Shows the theme a click would switch TO: day view → moon, night view → sun.
 */
@Component({
  selector: 'site-theme-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex' },
  template: `
    <svg class="theme-icon" [class.theme-icon--night]="night()" viewBox="0 0 24 24" aria-hidden="true">
      <g class="theme-icon__sun">
        <g class="theme-icon__rays" stroke="#f9b44e" stroke-width="1.7" stroke-linecap="round">
          <line x1="12" y1="1.6" x2="12" y2="4.2" />
          <line x1="12" y1="19.8" x2="12" y2="22.4" />
          <line x1="1.6" y1="12" x2="4.2" y2="12" />
          <line x1="19.8" y1="12" x2="22.4" y2="12" />
          <line x1="4.6" y1="4.6" x2="6.5" y2="6.5" />
          <line x1="17.5" y1="17.5" x2="19.4" y2="19.4" />
          <line x1="4.6" y1="19.4" x2="6.5" y2="17.5" />
          <line x1="17.5" y1="6.5" x2="19.4" y2="4.6" />
        </g>
        <circle cx="12" cy="12" r="4.7" fill="#fbc860" />
        <circle cx="10.3" cy="11.1" r="0.62" fill="#8a4b12" />
        <circle cx="13.7" cy="11.1" r="0.62" fill="#8a4b12" />
        <path
          d="M10.2 13.1 Q12 14.7 13.8 13.1"
          stroke="#8a4b12"
          stroke-width="0.9"
          fill="none"
          stroke-linecap="round"
        />
      </g>
      <g class="theme-icon__moon">
        <path d="M15.2 2.8 A9.4 9.4 0 1 0 21.4 14.9 A7.4 7.4 0 0 1 15.2 2.8 Z" fill="#8b9df7" />
        <path
          d="M9.3 11.6 q0.9 0.85 1.8 0"
          stroke="#28306e"
          stroke-width="0.9"
          fill="none"
          stroke-linecap="round"
        />
        <path
          d="M13.1 13.4 q0.75 0.7 1.5 0"
          stroke="#28306e"
          stroke-width="0.9"
          fill="none"
          stroke-linecap="round"
        />
        <path
          d="M10.9 15.6 q0.85 0.8 1.7 0"
          stroke="#28306e"
          stroke-width="0.9"
          fill="none"
          stroke-linecap="round"
          transform="rotate(8 11.75 15.6)"
        />
        <path
          d="M18.6 3.4 l0.5 1.2 1.2 0.5 -1.2 0.5 -0.5 1.2 -0.5 -1.2 -1.2 -0.5 1.2 -0.5 Z"
          fill="#c7d0fb"
        />
        <circle cx="21" cy="9.4" r="0.7" fill="#c7d0fb" />
      </g>
    </svg>
  `,
})
export class ThemeIconComponent {
  /** True when the icon should show the moon (i.e. the view is currently light). */
  readonly night = input.required<boolean>();
}
