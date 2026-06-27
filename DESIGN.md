---
name: LP Guardian
description: Attested LP diagnostics with a clear grid, proof cockpit, and traceable verdicts.
colors:
  paper: "#f8fdff"
  ice: "#eef9ff"
  sky-wash: "#d8f2ff"
  beam-blue: "#9fd7ee"
  beam-blue-deep: "#67b7d7"
  grid-blue: "#d7ecf8"
  grid-blue-strong: "#a9d9ef"
  command-navy: "#07392f"
  command-green: "#063d32"
  ink-black: "#0a0c0d"
  verifier-blue: "#9fd7ee"
  verifier-blue-deep: "#3f93b9"
  sponsor-amber: "#f7b500"
  proof-mint: "#c8f45b"
  success-mint: "#18a36b"
  slate-copy: "#42556d"
  muted-copy: "#7a8aa0"
  line: "#d7e8f1"
  rule-gray: "#6e777d"
  risk-red: "#c24a43"
typography:
  display:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "clamp(3.75rem, 8vw, 7.5rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0"
  proof:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(2.75rem, 6vw, 5.75rem)"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "0"
  headline:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.5vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "0"
  title:
    fontFamily: "Sora, Inter, system-ui, sans-serif"
    fontSize: "clamp(1.2rem, 2vw, 1.65rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.65
    letterSpacing: "0"
  mono:
    fontFamily: "JetBrains Mono, Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  sm: "10px"
  md: "18px"
  lg: "28px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "56px"
  xxl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.verifier-blue}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "16px 28px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.command-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "16px 28px"
  cockpit-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.command-navy}"
    rounded: "{rounded.lg}"
    padding: "28px"
  proof-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.verifier-blue}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
---

# Design System: LP Guardian

## 1. Overview

**Creative North Star: "The Proof Cockpit"**

LP Guardian moves into a clearer, sharper landing system inspired by the Turing Test sponsor poster: ice-white field, pale cyan grid, translucent blue vertical beams, deep green command typography, black sponsor-like contrast, one tiny amber accent, and a large app preview that sells the product in one glance.

The system must keep LP Guardian's own identity. This is not a permission governance product. It is a concentrated-liquidity diagnostic agent. The signature visual ingredients are tick ranges, IL reconstruction, swap replay, hook risk, provenance labels, TEE verdicts, rootHash stamps, and proof packs.

Physical scene: a hackathon judge scans the page on a bright laptop and sees a live diagnostic cockpit set into a crisp sponsor-poster atmosphere, not a generic SaaS hero. The page feels precise, auditable, and fast to understand.

**Key Characteristics:**

- Ice-white canvas with crisp pale-blue grid lines and tall translucent cyan beams.
- Deep command green for headline, navigation, and proof language.
- Verifier blue as the action color, used for buttons, active states, proof links, and thin vertical signal marks.
- One tiny amber accent per major brand moment, borrowed from the sponsor poster's Bybit detail.
- One italic serif proof phrase per major brand moment, never everywhere.
- Product cockpit preview below the hero, showing LP-specific data and public proof artifacts.
- Border-light, shadow-light surfaces. Use space and grid alignment before boxes.
- Honesty labels remain textual and visible, but look like evidence stamps, not pills everywhere.

## 2. Colors

The palette is a proof-poster system: ice carries clarity, deep green carries authority, verifier blue carries action, amber carries one deliberate accent, and mint carries successful verification.

### Primary

- **Command Green**: Headlines, nav, major labels, cockpit titles, report text. It comes directly from the Turing Test sponsor poster's dark green headline.
- **Verifier Blue**: Primary CTA, active links, proof marks, progress strokes, selected nav, important product actions. This is the same muted beam-cyan family as the reference image, never electric app-blue.

### Secondary

- **Ice / Sky Wash / Grid Blue**: Background field, quiet bands, app preview framing, section depth.
- **Beam Blue**: Translucent vertical poster beams. Use as broad structural atmosphere, not as blurry glow.
- **Sponsor Amber**: Tiny accent behind proof lines, selected marks, and rare highlight details.
- **Proof Mint**: Small verification highlights and success chip accents.

### Tertiary

- **Risk Red**: EMULATED, warning, failed proof, unavailable TEE. Use only when the system must reveal risk.

### Neutral

- **Paper**: Default background and surface color. Never use pure white.
- **Ink Black**: Sponsor/logo contrast and rare hard text. Do not use as main page background.
- **Slate Copy**: Body text and secondary explanations.
- **Muted Copy**: Hints, timestamps, inactive nav, metadata.
- **Line**: Hairlines, cockpit dividers, table rules.

### Named Rules

**The Sponsor Poster Rule.** Backgrounds use crisp grid plus translucent vertical beams, like the supplied sponsor image. No bokeh, radial blobs, foggy atrium washes, or generic gradients.

**The Blue Has A Job Rule.** Blue means action, proof, or active state. Do not scatter it as decoration.

**The Amber Is Rare Rule.** Amber appears as a single Bybit-like signal: proof underline, active notch, or tiny brand spark. It must never become the main palette.

**The Mint Is Evidence Rule.** Mint is for verified-success moments only. It is not the main brand color.

## 3. Typography

**Display Font:** Sora with Inter fallback.
**Proof Italic Font:** Source Serif 4 Italic with Georgia fallback.
**Body Font:** Inter with system fallback.
**Mono Font:** JetBrains Mono for hashes, token IDs, rootHash, and stream rows.

**Character:** Sora gives the page a precise command-layer voice. Source Serif 4 Italic adds the memorable proof phrase without turning the whole brand editorial. JetBrains Mono appears only where data needs to feel verifiable.

### Hierarchy

- **Display** (700, `clamp(3.75rem, 8vw, 7.5rem)`, 0.95): Hero headline and major campaign moments.
- **Proof** (500 italic, `clamp(2.75rem, 6vw, 5.75rem)`, 0.95): One emotional proof line, such as "Every number, traced." Use sparingly.
- **Headline** (700, `clamp(2rem, 4.5vw, 4.25rem)`, 1.02): Section openings.
- **Title** (700, `clamp(1.2rem, 2vw, 1.65rem)`, 1.15): Cockpit panels, proof cards, route tiles.
- **Body** (500, `1rem`, 1.65): Explanatory copy. Max line length 70ch.
- **Mono** (500, `0.8125rem`, 1.4): rootHash, tokenId, SSE events, report IDs.

### Named Rules

**The One Italic Hook Rule.** Each major screen gets at most one italic proof line. More than one makes it look like a template.

**The Data Stays Mono Rule.** Only machine-verifiable identifiers use mono. Do not use mono as generic tech costume.

## 4. Elevation

Depth is clean and product-like: white panels float over a grid with broad soft shadows and hairline borders. Default content sections can be borderless. Use boxes only for cockpit previews, proof packs, and interactive route cards.

### Shadow Vocabulary

- **Cockpit Float** (`box-shadow: 0 36px 90px rgb(6 57 47 / 0.12)`): Main app preview and proof pack panels.
- **Panel Float** (`box-shadow: 0 18px 48px rgb(6 57 47 / 0.08)`): Hovered cards, dropdowns, smaller proof panels.
- **Blue Action Glow** (`box-shadow: 0 14px 34px rgb(103 183 215 / 0.30)`): Primary button only.
- **No Lift** (`box-shadow: none`): Text ledgers, labels, partner rows, body sections.

### Named Rules

**The Preview Earns The Shadow Rule.** The big product cockpit may float. Supporting copy should not.

**The Borderless Ledger Rule.** Provenance and proof rows should use spacing, dots, and type hierarchy before borders.

## 5. Components

### Buttons

- **Shape:** Calm rounded rectangle (`10px`). Avoid pill CTAs except small proof chips.
- **Primary:** Verifier Blue fill, Paper text, `16px 28px`, Blue Action Glow. Use for Atlas, latest proof, live run.
- **Secondary:** Paper fill, no heavy border, Command Navy text, subtle Panel Float on hover.
- **Focus:** 2px Verifier Blue outline with 3px offset.

### Proof Chips

- **Style:** Small rounded chip with icon or dot, light blue tint, Verifier Blue text.
- **Use:** rootHash, report ID, TEE attested, public proof URL, VERIFIED/COMPUTED stamps.
- **Anti-pattern:** Do not draw thick outlined pills for every label. It looks AI-generated.

### Cockpit Preview

- **Style:** Large white app preview card with sidebar, top search/action bar, metric row, diagnostic stream, proof pack cards, and rootHash footer.
- **Content:** Must include LP-specific signals: tokenId, tick range, IL, regime, hook risk, rootHash, provenance labels.
- **Placement:** Hero should leave the top of the cockpit visible in first viewport, with more below fold.

### Provenance Ledger

- **Style:** Borderless rows or very quiet hairlines. Use small colored squares, label text, title, and short evidence description.
- **Labels:** VERIFIED, COMPUTED, ESTIMATED, EMULATED, LABELED remain textual.
- **Tone:** Looks like an audit ledger, not a badge wall.

### Navigation

- **Style:** Clean white header, brand mark left, centered nav, login/demo actions right.
- **Active:** Verifier Blue line or text state, not a filled nav pill.
- **Mobile:** Compact header with brand and primary action. Hide secondary nav when needed.

### Proof Pack Section

Show live outcomes as product artifacts: signed verdict, rootHash, storage URL, registry anchor, TEE report. Use three proof cards max, each with a status, short outcome, and truncated hash.

## 6. Do's and Don'ts

### Do:

- **Do** use the reference for clarity: ice grid, deep green headline, blue CTA, vertical cyan beams, black sponsor contrast, tiny amber accent, large app preview, proof-product framing.
- **Do** keep LP Guardian distinct through tick ranges, IL math, swap replay, hook risk, rootHash, and honesty labels.
- **Do** make the hero explain the product in 90 seconds for hackathon judges.
- **Do** keep backgrounds sharp and modern, with visible grid discipline.
- **Do** use one italic proof line as a memorable hook.
- **Do** preserve TODO(arch) and TODO(robinhood) honesty in code and copy.

### Don't:

- **Don't** copy the reference event title, sponsor logo layout, sponsor names, or event poster composition directly.
- **Don't** use blurry atrium backgrounds, foggy beams, or poster haze. Beams must stay crisp and architectural.
- **Don't** overuse bordered pills and outlined proof badges.
- **Don't** use SaaS-cream dashboards (Notion, Linear, Vercel-style white-on-white).
- **Don't** use navy-and-gold fintech (Coinbase, Bloomberg-ish).
- **Don't** use generic dark terminal aesthetic.
- **Don't** use glassmorphism decorative blurs.
- **Don't** use hero-metric template: big number, small label, supporting stats, gradient accent.
- **Don't** use identical card grids with icon, heading, and three lines of text.
- **Don't** use side-stripe borders, gradient text, radial blobs, purple glows, or heavy comic shadows.
