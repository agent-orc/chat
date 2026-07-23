# Chat history window benchmark

This benchmark was added to select safe library defaults for long conversations
instead of leaving every host to guess. Run it from the repository root:

```sh
npm ci
npm run benchmark:history
```

The command builds the package, imports the package's real `groupIntoPhases`
projection, and measures two paths in jsdom:

1. Initial projection plus the first virtual-window paint.
2. Twenty-five scroll positions across the expanded conversation, reported as
   time per update.

The fixture uses representative 300-byte coding-agent messages, user turns,
orchestrator turns, tool events, and role references. Earlier phases are
expanded for the benchmark, making it a worse case than the default UI. The
range virtualizer uses the shipped 120 px row estimate, 50-row buffer on both
sides, and a 720 px viewport. Thirty measured runs follow five warm-up runs.
`Retained fixture` is the UTF-8 wire payload size; it is a lower bound because
Angular signals, phase indexes, markdown output, and DOM nodes add overhead.

## Results

Recorded 2026-07-23 on Windows 11 Pro 10.0.26200, AMD Ryzen 7 4800H
(8 cores / 16 threads), Node 24.18.0, Angular 21.2.17, and jsdom 28.1.0.

| Messages | Initial projection + paint median (ms) | p95 (ms) | Scroll update median (ms) | p95 (ms) | Retained fixture (KiB) | Max painted rows |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 5.40 | 11.76 | 2.63 | 3.74 | 39.14 | 100 |
| 500 | 1.77 | 2.96 | 3.24 | 6.07 | 196.55 | 106 |
| 1,000 | 2.59 | 3.77 | 3.55 | 7.10 | 393.31 | 106 |
| 5,000 | 2.49 | 4.39 | 3.26 | 3.97 | 1,975.18 | 106 |

The 100-message p95 includes jsdom's first small-DOM allocation effects. The
important scaling result is that virtualized paint and scroll time remain
bounded while retained payload grows linearly. All measured scroll p95 values
remain below half of a 16.7 ms frame budget, including a 1,000-message
extension.

## Defaults derived from the measurements

| Default | Value | Rationale |
| --- | ---: | --- |
| Age-window count threshold | 500 messages | Keeps the normal retained wire payload near 200 KiB before old, low-value days are hidden. The age condition means dense but recent chats are still shown. |
| Age cutoff | 7 days | A readable recent-work horizon; it is a product default rather than a performance limit. |
| Small-chat bypass | 30 messages | Always shows short conversations in full, including previous days. At this size all costs are well below the smallest measured case. |
| Explicit extension | 1,000 messages | Its measured projection and scroll costs remain comfortably inside a frame while avoiding many small data-source requests. |
| Overall retained maximum | 5,000 messages | Caps the linear retained payload at about 1.93 MiB for the fixture before framework/markdown overhead. |
| Initial fallback page | 100 messages | Keeps hosts without stats immediately usable and below the first measured case. |
| Data-source page | 200 messages | Five bounded requests satisfy the default 1,000-message extension and keep cancellation/error recovery granular. |
| Virtual buffer | 50 rows per side | Paints at most 106 estimated rows in a 720 px viewport, which kept scroll p95 under 8 ms. |

These are conservative cross-host defaults, not hard-coded policy. Every value,
including the age cutoff, boundary distance, page size, row estimate, virtual
buffer, and maximum, is configurable through `provideCodingAgentChat`.

## Interpretation limits

jsdom timings are reproducible regression indicators, not browser paint
telemetry. Hosts with unusually large markdown bodies or embedded media should
run this script with representative fixture bodies and lower the count/max
thresholds if their browser trace exceeds its frame or memory budget. The
library maximum bounds retained messages, but it does not replace server-side
pagination.
