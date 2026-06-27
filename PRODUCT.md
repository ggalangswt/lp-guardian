# LP Guardian — Product Context

## register: brand+product
Brand register applies to Landing and Deck (marketing surfaces where design IS the product impression). Product register applies to Atlas, Diagnose, Report, Agent, Developers, Roadmap, and all modals (design SERVES the tool).

## Product Purpose

LP Guardian is a pre-action diagnostic and post-mortem tool for Mantle-native concentrated liquidity LPs. Before rebalancing or migrating a position, an LP pastes their NFT position ID and gets a TEE-attested multi-phase analysis: impermanent loss reconstruction, market regime classification, correlation analysis, and a rebalance proposal. After the run, a report is anchored on-chain via the Turing Benchmark Trail — the decision lives in a registry tied to their agent identity.

The core promise: every number the agent writes is traceable back to the raw input data, and the verdict is TEE-attested within AWS Nitro Enclaves.

## Users

**Primary — the active Mantle LP**: runs pools on Merchant Moe, Agni, or Fluxion. Knows what mETH and USDY are. Hates high slippage. Semi-technical.

**Secondary — the evaluating Turing Test judge**: assessing the AI x Web3 convergence (TEE, ElizaOS, Turing Registry), not using it daily. Needs to understand how it benchmarks agent performance in 90 seconds.

**Tertiary — the curious newcomer**: stumbled in from a buildathon post. Doesn't know LP. Needs enough context to understand why this matters.

## Brand tone

Confident and playful-technical. This is a hackathon project entered in **The Turing Test Hackathon 2026** — it should feel alive, opinionated, and fun, not like a B2B SaaS dashboard. Verbs over nouns. Present tense. Short sentences. No hedge words. No corporate-speak.

Voice examples:
- Good: "Your pool is trending. IL is eating your fees faster than you think."
- Bad: "The system has detected potential impermanent loss conditions in your liquidity position."
- Good: "Anchored. Anyone can verify."
- Bad: "The report has been successfully uploaded to the decentralised storage solution."

## Anti-references

- SaaS-cream dashboards (Notion, Linear, Vercel-style white-on-white)
- Navy-and-gold fintech (Coinbase, Bloomberg-ish)
- Generic dark terminal aesthetic (looks like every dev tool)
- Glassmorphism decorative blurs
- Hero-metric template (big number, small label, gradient accent)
- Identical card grids with icon + heading + 3 lines of text

## Visual theme

**Source image**: Turing Test sponsor poster: ice-white field, pale blue grid, tall translucent cyan beams, deep green headline, black sponsor contrast, one small Bybit-style amber accent, centered event confidence.
**Physical scene**: "A hackathon judge opens LP Guardian on a bright laptop at the demo table. The screen feels like a clean financial proof terminal printed on icy sponsor-poster paper: precise grid lines, a deep green command layer, crisp cyan beams, and a live diagnostic cockpit floating below the hero."

LP Guardian borrows the clarity, grid discipline, sponsor-poster atmosphere, and proof-product framing from the reference. It must not copy the reference event title, sponsor names, or logo layout. Our own character comes from concentrated-liquidity diagnostics: tick ranges, IL curves, rootHash proofs, provenance labels, and the feeling that every verdict can be audited.

Key elements from source image that carry into LP Guardian:
- Ice-white to pale-blue vertical grid background, crisp and modern, never blurry
- Tall translucent cyan beams as structural atmosphere, not fog or bokeh
- Deep green headline with one italic proof line as the emotional hook
- Muted beam-cyan primary action with a soft blue glow, matching the pale blue sponsor-poster beam instead of electric app-blue
- Tiny amber accent used sparingly like the Bybit mark in the reference
- Large product cockpit preview below the hero, showing LP diagnostics, rootHash, and provenance labels
- Clean header with brand mark, simple nav, and one filled dashboard/demo button
- Proof pack section with public URLs, evidence hashes, and live status chips
- Subtle mint only as verification success, not the main brand color

LP Guardian-specific signature motifs:
- Tick-range rails and price-band marks in diagrams
- RootHash and report IDs as visible proof artifacts
- Honesty labels as text stamps: VERIFIED, COMPUTED, ESTIMATED, EMULATED, LABELED
- Diagnostic journey words: Position, Replay, IL, Regime, Hook, Verdict, Anchor
- A "proof pack" preview for the signed report, not generic SaaS stats

## Hackathon context

**Event**: The Turing Test Hackathon 2026 (Mantle)
**Chain**: Mantle Sepolia
**Tech stack**: ElizaOS, Byreal Skills CLI, AWS Nitro Enclaves, Python/FastAPI math service, Solidity contracts.

## Honesty labels (must be preserved, non-negotiable)

Every data point the agent emits carries a provenance label. These are not decorative:

| Label     | Meaning                                             | Design color |
|-----------|-----------------------------------------------------|--------------|
| VERIFIED  | Pulled directly from chain / subgraph, no inference | Verifier blue / success mint |
| COMPUTED  | Deterministic formula from verified inputs          | Navy on paper |
| ESTIMATED | Statistical / heuristic — calibrated but not exact  | Soft cobalt |
| EMULATED  | Fallback — TEE unavailable, stub used               | Risk red |
| LABELED   | Classified by the regime model                      | Slate blue |

## Strategic principles

1. Every number traces to source. No hallucinated data in the verdict.
2. Honesty labels are load-bearing UI — never reduce them to decorative dots.
3. TEE attestation claim is backed by AWS Nitro Enclave signatures.
4. The product cockpit is the new character system. Use tick ranges, rootHash stamps, proof packs, and diagnostic rails instead of mascots.
5. Focus on Mantle-native yield assets like mETH and USDY as benchmarks.
