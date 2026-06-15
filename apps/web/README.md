# @lpguardian/web

Frontend for LP Guardian. Built with React, Vite, React Query, React Router, viem, and wagmi.

**Hosted UI:** https://lpguardian.vercel.app/

## Purpose

The web app gives LP Guardian three main user-facing surfaces:

- **Atlas** to browse LP wallets and positions
- **Diagnose** to watch the live streamed pipeline
- **Report** to inspect the persisted output by `rootHash`

Supporting pages:

- `/agent` for the live on-chain agent state
- `/deck` for a web-native presentation deck
- `/roadmap` for planned follow-up work

## Routes

| Route | Purpose |
| --- | --- |
| `/` | landing page |
| `/atlas` | wallet scanner and demo cartridges |
| `/diagnose/:tokenId` | streamed diagnosis UI |
| `/report/:rootHash` | read-only report viewer |
| `/agent` | on-chain LPGuardianAgent state |
| `/deck` | pitch / product deck |
| `/roadmap` | roadmap and follow-up work |

## Runtime Backend Resolution

Production requests must hit the deployed backend directly. The frontend resolves the API base from:

1. `VITE_LPDOCTOR_API_URL`
2. `VITE_API_URL`
3. fallback: `https://lp-guardian-mainnet.up.railway.app`

This is important because Vite's local dev proxy only exists in development. In Vercel / static hosting, relative `/api/...` requests would otherwise hit the frontend origin and fail.

## Key Components

| Area | Main Components |
| --- | --- |
| Landing | `Landing.tsx`, `AppHeader.tsx` |
| Atlas | `Atlas.tsx`, `PositionCard.tsx`, `AggStat.tsx` |
| Diagnose | `useDiagnosticStream.ts`, IL / regime / hooks / migration / provenance / verdict panels |
| Report | `useReport.ts`, `Report.tsx`, `ReportProvenancePanel.tsx` |
| Agent | `Agent.tsx`, `useAgentLiveState.ts` |

## Honesty Labels

LP Guardian uses a fixed honesty layer for numbers and interpretations:

| Label | Meaning |
| --- | --- |
| `VERIFIED` | direct chain or canonical index data |
| `COMPUTED` | mathematically derived from verified inputs |
| `ESTIMATED` | heuristic or statistical inference |
| `EMULATED` | simulation or deterministic fallback |
| `LABELED` | manual or categorical labeling |

These labels are rendered consistently in the UI so users can distinguish facts from estimates.

## Local Development

From the repo root:

```bash
pnpm install
pnpm dev:web
```

If you want the full product locally, also run:

```bash
docker compose up -d
pnpm db:push
pnpm dev:server
```

Then open:

- `http://localhost:3100`

## Demo Wallets

Atlas ships with curated wallet fixtures for review and demos:

- Portfolio
- Bleeding
- Mixed
- Whale
- Healthy
- Drifting

The addresses are hardcoded in `src/pages/Atlas.tsx`, but the data itself is fetched from the backend.
