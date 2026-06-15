# LP Guardian — Product Context

## register: brand+product
Brand register applies to Landing and Deck (marketing surfaces where design IS the product impression). Product register applies to Atlas, Diagnose, Report, Agent, Developers, Roadmap, and all modals (design SERVES the tool).

## Product Purpose

LP Guardian is a pre-action diagnostic and post-mortem tool for Uniswap v3/v4 concentrated liquidity LPs. Before rebalancing or migrating a position, an LP pastes their NFT position ID and gets a TEE-attested multi-phase analysis: impermanent loss reconstruction, market regime classification (mean-reverting / trending / high-toxic / JIT-dominated), hook risk scoring, and a migration preview. After the run, a report is uploaded to IPFS storage and anchored on-chain — the hash lives in an iNFT (ERC-7857) tied to their agent.

The core promise: every number the agent writes is traceable back to the raw input data (AT-4 hallucination guard), and the verdict is TEE-attested — not a marketing chatbot output.

## Users

**Primary — the active LP**: runs 3-15 pools simultaneously, checks positions 1-3x daily, knows what IL means, hates gas waste. Semi-technical (can read a tx hash, knows Uniswap v3 tick math at a high level). Main fear: "did I get wrecked by JIT bots without realising?"

**Secondary — the evaluating researcher / hackathon judge**: assessing the architecture (TEE, iNFT, provenance chain), not using it daily. Needs to understand how it works in 90 seconds.

**Tertiary — the curious newcomer**: stumbled in from a buildathon post. Doesn't know LP. Needs enough context to understand why this matters.

## Brand tone

Confident and playful-technical. This is a hackathon project entered in the Arbitrum Open House London Buildathon — it should feel alive, opinionated, and fun, not like a B2B SaaS dashboard. Verbs over nouns. Present tense. Short sentences. No hedge words ("may", "might", "could"). No corporate-speak.

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

**Source image**: Arbitrum Open House London hero artwork.
**Physical scene**: "Hackathon poster pinned to a corkboard in a London co-working space at 2pm on a bright Saturday. The room is loud and full of builders. The poster is confident enough to be mistaken for a music festival lineup."

Key elements from source image that carry into LP Guardian:
- Deep navy → royal blue vertical gradient background (the whole page IS this gradient)
- Electric lime / yellow-green chunky display headline, nearly as tall as the page allows
- Thick black outlines on everything (4-6px, no soft edges, no anti-aliased gradients)
- Cartoon blue mascot characters (smurf-proportioned: big head, small body, chunky limbs), cyan-blue fill, black ink outline
- Speech bubbles with hard ink borders
- Location/context chip in lime text on black pill (e.g. "LONDON, UNITED KINGDOM")
- Hard drop shadows (4px 4px 0 black, no blur) on interactive elements

## Hackathon context

**Event**: Arbitrum Open House London Buildathon
**Chain**: Robinhood Chain (Arbitrum Orbit) — chain config is placeholder + TODO(robinhood) until contract deployment
**Tech stack preserved from prior phase**: IPFS storage + Phala TEE labels remain in UI with TODO(arch) markers — architecture TBD for Robinhood Chain

## Honesty labels (must be preserved, non-negotiable)

Every data point the agent emits carries a provenance label. These are not decorative:

| Label     | Meaning                                             | Design color |
|-----------|-----------------------------------------------------|--------------|
| VERIFIED  | Pulled directly from chain / subgraph, no inference | Lime         |
| COMPUTED  | Deterministic formula from verified inputs          | Paper white  |
| ESTIMATED | Statistical / heuristic — calibrated but not exact  | Char cyan    |
| EMULATED  | Fallback — TEE unavailable, stub used               | Accent pink  |
| LABELED   | Classified by the regime model                      | Surface card |

## Strategic principles

1. Every number traces to source. No hallucinated data in the verdict.
2. Honesty labels are load-bearing UI — never reduce them to decorative dots.
3. TEE attestation claim is conditional on `stub: false`. If stub, show the warning prominently.
4. The mascots are characters, not logos. They convey state (loading, error, success), not just decor.
5. Rebrand is skin-deep until the backend rebuilds for Robinhood Chain. Don't over-promise on-chain features in copy.
