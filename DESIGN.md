# LP Guardian — Design System

Source of truth for all redesign work. Cite this file, don't re-derive from scratch.

Visual theme: Arbitrum Open House London Buildathon hero — deep navy gradient, electric lime display type, thick black ink outlines, cyan cartoon mascots, hard comic-book shadows.

---

## 1. Visual North Star

**Scene**: Hackathon poster pinned to a corkboard in a London co-working space at 2pm on a bright Saturday. The room is loud. Builders everywhere. The poster is confident enough to be mistaken for a music festival lineup — not a fintech product.

The UI inherits the energy of that poster. Royal blue fills the entire viewport. Lime type is large enough to be read across the room. Every card, button, and chip has a thick ink border and a hard offset shadow. Three mascot characters — chunky, cyan, smurf-proportioned — appear at moments of meaning (loading, empty state, success, signing).

**What this is NOT**: a dark dashboard, a glassmorphism card gallery, a terminal emulator aesthetic. None of those.

---

## 2. Color Palette (OKLCH)

All color values use OKLCH. CSS custom properties defined in `apps/web/src/styles/tokens.css`.

### Replace the current token set with:

```css
/* ── Backgrounds ──────────────────────────────── */
--bg-deep:        oklch(0.22 0.13 265);   /* deep navy — top of page gradient */
--bg-royal:       oklch(0.38 0.18 260);   /* royal blue — bottom / data surfaces */
--bg-card:        oklch(0.30 0.10 262);   /* surface for cards on gradient */
--bg-paper:       oklch(0.97 0.01 250);   /* speech-bubble white (cool-tinted) */
--bg-modal-scrim: oklch(0.15 0.10 260 / 0.72);

/* ── Ink (outlines + text on light bg) ────────── */
--ink:            oklch(0.12 0.02 260);   /* near-black, slightly blue-shifted */

/* ── Accent — Lime (primary emphasis) ─────────── */
--lime:           oklch(0.92 0.22 130);   /* electric yellow-green headline */
--lime-deep:      oklch(0.78 0.21 130);   /* hover / pressed state */
--lime-text:      oklch(0.40 0.15 130);   /* lime text on paper (passes AAA) */

/* ── Mascot Cyan ──────────────────────────────── */
--char-cyan:      oklch(0.68 0.18 230);   /* mascot body fill */
--char-cyan-hi:   oklch(0.82 0.14 220);   /* mascot highlight / sheen */
--char-cyan-shadow: oklch(0.52 0.16 235); /* mascot shadow / depth */

/* ── Accents ──────────────────────────────────── */
--accent-pink:    oklch(0.72 0.20 15);    /* heart icon, celebratory states */

/* ── Honesty label semantic colors ────────────── */
--label-verified:  var(--lime);           /* VERIFIED — chain-pulled fact */
--label-computed:  var(--bg-paper);       /* COMPUTED — deterministic formula */
--label-estimated: var(--char-cyan);      /* ESTIMATED — statistical heuristic */
--label-emulated:  var(--accent-pink);    /* EMULATED — TEE fallback stub */
--label-labeled:   oklch(0.78 0.08 260);  /* LABELED — classifier output */

/* ── Text on gradient bg ──────────────────────── */
--text:           oklch(0.97 0.01 250);   /* body text on royal/navy */
--text-secondary: oklch(0.78 0.06 255);   /* secondary on gradient */
--text-muted:     oklch(0.60 0.08 258);   /* timestamps, captions */

/* ── Fonts ────────────────────────────────────── */
--font-display: 'Bagel Fat One', system-ui, sans-serif;
--font-sans:    'Inter', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Geist Mono', ui-monospace, monospace;
```

### Color strategy: Committed

Royal-blue carries 50-60% of every surface. Lime is the singular emphasis (~10%). Cyan mascots punctuate without overwhelming. Paper white is reserved for speech bubbles and modal bodies only.

### Contrast guarantees

- `--text` on `--bg-royal`: passes WCAG AA at 14px, AAA at 18px
- `--lime` on `--bg-royal`: passes AA at 24px display. Do NOT use lime for body text.
- `--ink` on `--lime`: passes AAA at all sizes (button labels, chip text)
- `--ink` on `--bg-paper`: passes AAA

---

## 3. Typography

### Font stack

| Role | Font | Usage |
|---|---|---|
| Display | Bagel Fat One (400) | Headlines, hero, section titles. All-caps only. |
| Body | Inter (500) | All prose. Weight 500 default (heavier than Inter 400 to balance loud display). |
| Mono | JetBrains Mono | Addresses, hashes, numbers, code. |

**Load via Google Fonts** (already wired to `apps/web/index.html`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Type scale

| Step | Size | Usage |
|---|---|---|
| xs | 12px | Timestamps, footnotes, honesty label text |
| sm | 14px | Body copy, list items |
| base | 16px | Default body |
| md | 20px | Sub-headings, card titles |
| lg | 28px | Section headings (product surfaces) |
| xl | 40px | Section headings (brand surfaces) |
| 2xl | 56px | Page titles on brand surfaces |
| 3xl | 80px | Hero secondary (Deck slide titles) |
| 4xl | 128px | Hero primary (Landing desktop) |
| hero | 200px | Maximum hero display (wide screens only) |

≥1.4 ratio between each display step.

### Display type rules

- Always `font-family: var(--font-display); text-transform: uppercase; letter-spacing: -0.02em;`
- On gradient background: flat `color: var(--lime)`
- On paper/photo surfaces: add `text-shadow: 4px 4px 0 var(--ink), -2px -2px 0 var(--ink), 2px -2px 0 var(--ink), -2px 2px 0 var(--ink)` to simulate ink outline
- Body line-length cap: 65-75ch

---

## 4. Outlines + Shape Language

This is the most important rule of the visual system. **Everything has a thick ink border and a hard offset shadow.**

### Borders

| Context | Border width | Color |
|---|---|---|
| Buttons, chips, inputs | 3px solid var(--ink) | Always |
| Cards | 3px solid var(--ink) | Always |
| Modals | 4px solid var(--ink) | Always |
| Hero-level elements | 5-6px solid var(--ink) | Mascots, speech bubbles |

Never use `border: 1px solid` with a muted color. The border is part of the visual language.

### Hard offset drop shadow

```css
/* Standard interactive element */
box-shadow: 4px 4px 0 var(--ink);

/* Cards */
box-shadow: 6px 6px 0 var(--ink);

/* Modal frame */
box-shadow: 8px 8px 0 var(--ink);

/* Hero / mascot */
box-shadow: 10px 10px 0 var(--ink);
```

**No `blur-radius`. No `spread-radius`. No `rgba` shadow.** Hard offset only. This is the comic-book elevation system.

Soft `box-shadow` is banned from this design system. Drop `filter: drop-shadow()` too.

### Border radius

| Element | Radius |
|---|---|
| Buttons | 14px |
| Cards | 24px |
| Chips / badges | 9999px (pill) |
| Inputs | 14px |
| Modals | 24px |
| Speech bubbles | 20px (tail uses CSS clip-path) |
| Mascot figures | Irregular (SVG path) |

No sharp right angles on interactive elements. No `border-radius: 0` except ink outlines themselves.

---

## 5. Mascot System

Three LP Guardian characters. All share the same visual DNA: chunky cyan body, big round head (60% of total height), small body, stubby arms, thick 4px ink outline, 2-tone highlight on head.

### The three mascots

**Hodler** (`/public/mascots/hodler.svg`)
- Sleepy-eyed, half-lidded expression
- Holding a fat token sack with `$` label
- Emotion: calm, patient, slightly smug
- Used on: Landing hero (left), Atlas pool grid empty state

**Diagnoser** (`/public/mascots/diagnoser.svg`)
- Alert eyes, lab coat (white outline over cyan body)
- Stethoscope pressed to a pool icon (two circles, Uniswap-ish)
- Emotion: focused, confident
- Used on: Diagnose loading state, Report verdict area

**Anchor** (`/public/mascots/anchor.svg`)
- Wide stance, arms out, holding a receipt/scroll
- Tiny anchor tattoo on arm
- Emotion: solid, trustworthy
- Used on: Report provenance panel, Agent page, Modal signing state

### Mascot spec

```
Total height:         240px (SVG viewBox)
Head:                 144px diameter circle
Body:                 96px height (trapezoidal)
Arms:                 14px wide, rounded ends
Eyes:                 Ink circles, 14px diameter, white 3px pupil
Outline stroke:       4px var(--ink), stroke-linejoin: round
Body fill:            var(--char-cyan)
Highlight fill:       var(--char-cyan-hi), top-left crescent, 36px
Shadow fill:          var(--char-cyan-shadow), bottom-right, 28px
```

Pre-redesign placeholder: use inline `<div>` blocks with initials (H / D / A) in display font on cyan background. Real SVGs to be illustrated separately.

### Placement rules

- Never resize mascots smaller than 120px tall
- Always leave 24px margin from other content
- Idle bob animation on hero. Static elsewhere.
- `role="presentation"` when purely decorative; `role="img" aria-label="..."` when conveying state

---

## 6. Speech Bubbles

The speech bubble is a first-class UI component, not a decorative afterthought.

### Anatomy

- Background: `var(--bg-paper)`
- Border: 3px solid `var(--ink)`
- Border-radius: 20px
- Box-shadow: 6px 6px 0 `var(--ink)`
- Tail: CSS `clip-path` or SVG path triangle, same ink border
- Padding: 16px 20px

### Tail positions

`tail="bl"` — bottom-left (mascot is bottom-left of bubble)
`tail="br"` — bottom-right
`tail="tl"` — top-left
`tail="tr"` — top-right

### Content inside bubbles

- Text: `var(--ink)`, Inter 500, 14-16px
- Heart accent: `var(--accent-pink)`, 16px glyph or SVG
- On hero: tagline text in display font, smaller size (40-56px)

### Usage contexts

| Surface | Bubble content |
|---|---|
| Landing hero | "Guard your LP before it guards itself." |
| Diagnose loading | "Running {n} phases…" |
| Report verdict | Full verdict summary (replaces current slate panel) |
| Agent page | Signer address + attestation claim |
| Modal onboarding tips | Short instructional text |
| Empty states | Mascot-specific quip ("Nothing staked yet.") |

---

## 7. Background System

```css
/* Full-page gradient — all routes */
body {
  background: linear-gradient(to bottom, var(--bg-deep) 0%, var(--bg-royal) 100%);
  background-attachment: fixed;
  min-height: 100vh;
}

/* Data-dense surfaces (Atlas pool grid, table rows) */
.surface-data {
  background: var(--bg-royal);
}

/* Cards (use --bg-card, not --bg-paper) */
.hard-card {
  background: var(--bg-card);
}

/* Paper only for speech bubbles and modal body */
.speech-bubble,
.modal-body {
  background: var(--bg-paper);
}

/* Modal scrim */
.modal-backdrop {
  background: var(--bg-modal-scrim);
  backdrop-filter: none; /* no blur — this is not glassmorphism */
}
```

No radial-gradient glows. No ambient gradient overlays. The linear deep→royal is the only background treatment.

---

## 8. Motion

### Timing functions

```css
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
```

No bounce. No elastic. No spring physics.

### Keyframes

```css
/* Mascot idle bob — hero only */
@keyframes mascot-bob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-4px); }
}
.mascot-hero { animation: mascot-bob 4s var(--ease-out-quart) infinite; }

/* Headline clip reveal — fires once on mount */
@keyframes headline-reveal {
  from { clip-path: inset(100% 0 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
.headline-reveal { animation: headline-reveal 700ms var(--ease-out-expo) both; }

/* Button press — hard shadow snaps to 0, element moves 4px */
.hard-btn:active {
  transform: translate(4px, 4px);
  box-shadow: 0 0 0 var(--ink);
}
```

### Rules

- Animate `transform` and `opacity` only (never width, height, padding, border)
- `prefers-reduced-motion: reduce` → disable mascot-bob + headline-reveal, keep instant transform on buttons
- Page transitions: none (SPA, route changes are instant)

---

## 9. Component Recipes

Canonical implementations. When creating new UI, use these patterns — do not re-invent.

### HardCard

```tsx
// bg-card surface + ink outline + hard shadow
// Replaces all current slate-700/bg-slate-900 panels
<div className="hard-card">
  {children}
</div>
```

```css
.hard-card {
  background: var(--bg-card);
  border: 3px solid var(--ink);
  border-radius: 24px;
  box-shadow: 6px 6px 0 var(--ink);
  padding: 20px 24px;
}
```

### HardButton

```tsx
<button className="hard-btn hard-btn--lime">Analyze position</button>
<button className="hard-btn hard-btn--paper">Cancel</button>
<button className="hard-btn hard-btn--ink">Danger action</button>
```

```css
.hard-btn {
  font-family: var(--font-display);
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  padding: 12px 24px;
  border-radius: 14px;
  border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
  cursor: pointer;
  transition: transform 80ms linear, box-shadow 80ms linear;
}
.hard-btn:active {
  transform: translate(4px, 4px);
  box-shadow: 0 0 0 var(--ink);
}
.hard-btn--lime  { background: var(--lime); color: var(--ink); }
.hard-btn--paper { background: var(--bg-paper); color: var(--ink); }
.hard-btn--ink   { background: var(--ink); color: var(--lime); }
```

### HeadlineLime

```tsx
<h1 className="headline-lime headline-reveal">LP GUARDIAN</h1>
```

```css
.headline-lime {
  font-family: var(--font-display);
  color: var(--lime);
  text-transform: uppercase;
  letter-spacing: -0.02em;
  line-height: 0.9;
  /* No text-shadow for headline on gradient bg — flat lime only */
}
```

### ChipBlackLime

Location/status chip treatment from Open House image.

```tsx
<span className="chip-black-lime">LONDON · ARBITRUM</span>
<span className="chip-black-lime">ROBINHOOD CHAIN</span>
```

```css
.chip-black-lime {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  background: var(--ink);
  color: var(--lime);
  border: 3px solid var(--ink);
  border-radius: 9999px;
  font-family: var(--font-display);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 3px 3px 0 var(--lime);
}
```

### HonestyBadge (replaces LabelBadge)

```tsx
<span className={`honesty-badge honesty-badge--${label.toLowerCase()}`}>
  {label}
</span>
```

```css
.honesty-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  border: 2px solid var(--ink);
  font-family: var(--font-display);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
}
.honesty-badge--verified  { background: var(--lime); }
.honesty-badge--computed  { background: var(--bg-paper); }
.honesty-badge--estimated { background: var(--char-cyan); }
.honesty-badge--emulated  { background: var(--accent-pink); }
.honesty-badge--labeled   { background: var(--label-labeled); color: var(--text); }
```

### MascotSlot

```tsx
<MascotSlot mascot="hodler" size={200} animate={isHero} />
// Pre-SVG: renders a cyan circle with initial letter
// Post-SVG: renders the actual SVG from /public/mascots/{mascot}.svg
```

### SpeechBubble

```tsx
<SpeechBubble tail="bl">
  <p>Your pool is trending. IL is eating your fees.</p>
</SpeechBubble>
```

```css
.speech-bubble {
  position: relative;
  background: var(--bg-paper);
  border: 3px solid var(--ink);
  border-radius: 20px;
  box-shadow: 6px 6px 0 var(--ink);
  padding: 16px 20px;
  color: var(--ink);
}
/* Tail via ::after pseudo-element, positioned per variant */
.speech-bubble[data-tail="bl"]::after {
  content: '';
  position: absolute;
  bottom: -18px;
  left: 24px;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 18px solid var(--ink);
}
```

### HardModal

```tsx
<dialog className="hard-modal">
  <div className="hard-modal__inner">
    <div className="hard-modal__mascot"><MascotSlot mascot="anchor" size={80} /></div>
    <h2 className="hard-modal__title">Sign migration</h2>
    <div className="hard-modal__body">{children}</div>
    <footer className="hard-modal__footer">
      <button className="hard-btn hard-btn--lime">Confirm</button>
      <button className="hard-btn hard-btn--paper">Cancel</button>
    </footer>
  </div>
</dialog>
```

```css
.hard-modal {
  border: 4px solid var(--ink);
  border-radius: 24px;
  box-shadow: 8px 8px 0 var(--ink);
  background: var(--bg-paper);
  color: var(--ink);
  padding: 0;
  max-width: 480px;
  width: calc(100vw - 48px);
}
.hard-modal::backdrop {
  background: var(--bg-modal-scrim);
}
.hard-modal__mascot {
  position: absolute;
  top: -48px;
  right: 24px;
}
.hard-modal__inner {
  position: relative;
  padding: 28px 28px 24px;
}
```

---

## 10. Per-Page Redesign Briefs

One paragraph + key changes per route. Read alongside the component recipes above.

### `/` Landing

**Register: brand.**

Hero is the poster: full-viewport `--bg-deep → --bg-royal` gradient, `headline-lime` "LP GUARDIAN" at 128-200px (responsive), Hodler + Diagnoser mascots flanking the headline (Diagnoser right with stethoscope out, Hodler left leaning on a pool tick boundary), "ARBITRUM OPEN HOUSE · LONDON" chip below the headline in `chip-black-lime`. Hero CTA: two `HardButton` (lime primary + paper secondary), horizontal. Below the fold: royal-blue sections with paper `HardCard` grids (features, how it works, honesty label explainer). Footer: black strip with lime text, year + event chip.

Key changes from current: remove `lp-grid-bg` dot grid, remove phosphor-amber CRT aesthetic, replace slate panels with `HardCard`, add mascots, swap `Space Grotesk` hero headline for `Bagel Fat One`.

### `/deck`

**Register: brand.**

Slide chrome: each slide is a `HardCard` at near full-screen, hard shadow, paper or royal-blue background alternating. Slide titles: `Bagel Fat One` 56-80px, lime or ink depending on slide bg. Title slide: same mascot arrangement as Landing hero, smaller. "Why LP Guardian" slide: Hodler mascot holding a "WHY HODL?" speech bubble. Competitor comparison: avoid identical card grid — use a table or a scored bar chart.

Key changes: replace current slide panel borders, add mascots, increase type scale on titles.

### `/atlas`

**Register: product.**

Background: solid `--bg-royal` (not gradient, calmer for scanning data). Pool cards: `HardCard` with paper tint. Search/filter bar: ink-outlined input, 3px border, hard shadow. Pagination: ink-outlined buttons. Empty state: Hodler mascot sitting cross-legged with speech bubble "No pools found. Check filters."

Key changes: replace slate cards, add empty state mascot, recolor search bar.

### `/diagnose/:id`

**Register: product.**

Loading state: Diagnoser mascot at center with animated stethoscope (CSS stroke-dashoffset animation), `SpeechBubble` above showing "Running phase {n}…". Phase steps: timeline as vertical `ChipBlackLime` pills with `HonestyBadge` inline. ToolCallBadge: ink-outlined chip, paper bg, mono text. Once complete, scroll to verdict section.

Key changes: add mascot loading state, restyle phase step list, restyle ToolCallBadge.

### `/report/:hash`

**Register: product.**

Verdict section: giant `SpeechBubble` (tail pointing down-left toward a small Diagnoser mascot below it). Bubble contains the verdict markdown. Provenance panel: `HardCard` with `HonestyBadge--verified` lime stamp in top-right corner when fully verified. IL panel, Regime panel: `HardCard`.

Key changes: verdict moved into SpeechBubble wrapper, mascot added, badges recolored.

### `/agent`

**Register: product + light brand.**

Anchor mascot next to the contract address block. Attestation chip: `chip-black-lime` "TEE ATTESTED". iNFT ID and agent contract: mono in paper `HardCard`. Live state sections (signer, ledger balance): `HardCard` with hard shadow.

Key changes: mascot added, attestation chip recolored, panels switched to HardCard.

### `/developers`

**Register: product.**

Page opens with Hodler mascot in top-right holding a `curl` `SpeechBubble`. Code blocks: paper `HardCard`, 3px ink border, `JetBrains Mono`, `--ink` text (dark on light). MCP tool list: ink-outlined table rows. GitHub link chip: `chip-black-lime`.

Key changes: mascot added, code blocks switched to paper HardCard (currently dark), text color flips on code blocks.

### `/roadmap`

**Register: product + light brand.**

Phases as numbered `HardCard` blocks. Current phase card: `--lime` background with `--ink` text. Completed phases: `--bg-card` with strikethrough phase title. Future phases: `--bg-royal` with muted text. Each phase card has a small mascot in the corner (Hodler=past, Diagnoser=present, Anchor=future).

Key changes: all timeline cards get ink outlines + hard shadows, current phase gets lime highlight, mascots added.

### Modals (MigrationModal, ConnectButton modal, etc.)

**Register: product.**

All modals use `HardModal` frame: paper body, ink border 4px, 8px offset shadow, Anchor mascot in top-right corner peeking over the frame edge. Confirm button: `HardButton--lime`. Cancel: `HardButton--paper`. Danger: `HardButton--ink`.

Key changes: replace current slate modal frames with HardModal, add Anchor mascot, restyle buttons.

---

## 11. Honesty Layer Preservation

Honesty labels are non-negotiable product features. The redesign changes their visual appearance only — not their placement, logic, or meaning.

### Migration from LabelBadge to HonestyBadge

| Old class | New class | Color |
|---|---|---|
| `bg-emerald-500/10 text-emerald-300` | `honesty-badge--verified` | Lime |
| `bg-cyan-500/10 text-cyan-300` | `honesty-badge--computed` | Paper |
| `bg-amber-500/10 text-amber-300` | `honesty-badge--estimated` | Char cyan |
| `bg-orange-500/10 text-orange-300` | `honesty-badge--emulated` | Accent pink |
| `bg-violet-500/10 text-violet-300` | `honesty-badge--labeled` | Slate-like |

The stub warning banner in `VerdictPanel.tsx` (orange alert box) stays. Restyle border to `3px solid var(--ink)` and background to `var(--accent-pink) / 0.15`.

All `TODO(arch)` and `TODO(robinhood)` code comments stay untouched during the visual redesign.

---

## 12. Accessibility

- `--lime` on `--bg-royal`: large text (24px+) passes WCAG AA. Use as headline only.
- `--ink` on `--lime`: passes AAA at all sizes. Use for button labels, chip text.
- `--ink` on `--bg-paper`: passes AAA. Use for modal body, speech bubble text.
- `--text` on `--bg-royal`: passes AA at 14px+.
- Never use `--lime` for body copy. It fails AA at small sizes on blue.
- Mascots: `role="presentation"` when decorative, `role="img" aria-label="Diagnoser mascot: analysis in progress"` when state-bearing.
- Hard buttons: `:focus-visible { outline: 3px solid var(--lime); outline-offset: 3px; }`
- `prefers-reduced-motion`: disable `mascot-bob` + `headline-reveal` animations. Button press snap stays (120ms, imperceptible).

---

## 13. Asset Inventory

| File | Status | Notes |
|---|---|---|
| `apps/web/public/logo-lp-guardian.png` | Exists | Existing logo, keep for now |
| `apps/web/public/mascots/hodler.svg` | TODO | Placeholder: cyan div with "H" |
| `apps/web/public/mascots/diagnoser.svg` | TODO | Placeholder: cyan div with "D" |
| `apps/web/public/mascots/anchor.svg` | TODO | Placeholder: cyan div with "A" |

---

## 14. Implementation Order (recommended)

When executing the redesign, tackle in this order to get visual signal fast:

1. **tokens.css** — swap entire token set to new OKLCH palette. One file, full scope.
2. **index.html** — add Bagel Fat One Google Fonts link.
3. **LabelBadge** → **HonestyBadge** component rename + reskin.
4. **Landing** hero — biggest visual payoff.
5. **Deck** — hackathon judges see this second.
6. **Atlas + Diagnose** — HardCard + mascot empty/loading states.
7. **Report** — SpeechBubble verdict wrapper.
8. **Agent + Developers + Roadmap** — HardCard + mascot touches.
9. **Modals** — HardModal frame last (least urgent).
