# LP Guardian — TEE Attestor (Phala / dstack CVM)

A tiny service that runs **inside a Phala Cloud CPU (Intel TDX) CVM**. It computes
the LP Guardian verdict deterministically and returns a **TDX remote-attestation
quote** whose `report_data` commits to `keccak256(inputs + verdict)`.

That turns the phase-10 verdict from `EMULATED` → **`VERIFIED`**: anyone can verify
the quote proves *this exact code produced this verdict inside a genuine TEE*.

> Runs fine locally too — without a dstack socket it returns `attested: false`
> (no quote), so you can test the container before deploying.

## Endpoints

| Method | Path | Body / Result |
|--------|------|---------------|
| `GET`  | `/health`  | `{ ok, tee }` (`tee=true` inside a CVM) |
| `POST` | `/verdict` | in: `{ pair, il, regime, hookScore }` → out: `{ recommendation, markdown, reportData, quote, attested }` |

Auth: if `AUTH_TOKEN` is set, requests must send `Authorization: Bearer <AUTH_TOKEN>`.

---

## Your turn: deploy (≈10 min, $0 — uses free CVM credits)

### 1. Build & push the image to a PUBLIC registry
Phala Cloud pulls a public image, and Phala TDX runs **linux/amd64** — so the
image MUST be amd64. On an Apple Silicon (arm64) Mac, cross-build with buildx
(QEMU emulation):

```bash
cd tee-attestor
docker login
# one-time: enable amd64 emulation + a container builder
docker run --privileged --rm tonistiigi/binfmt --install amd64
docker buildx create --name lpgbuilder --driver docker-container --use

# build amd64 and push in one shot
docker buildx build --platform linux/amd64 \
  -t scientivan/lp-guardian-tee-attestor:latest --push .
```

On an Intel/amd64 host you can instead use the simple path:
`docker build -t scientivan/lp-guardian-tee-attestor:latest . && docker push scientivan/lp-guardian-tee-attestor:latest`

(Optional local smoke test before pushing — expect `attested:false` locally:)
```bash
docker run --rm -p 8090:8090 -e AUTH_TOKEN=devtoken scientivan/lp-guardian-tee-attestor:latest
curl localhost:8090/health
```

### 2. `docker-compose.yaml`
Already set to `scientivan/lp-guardian-tee-attestor:latest` — nothing to change.

### 3. Deploy on Phala Cloud
1. Go to **https://cloud.phala.com/dashboard** → **Deploy** / **Create CVM**.
2. Choose **"Advanced / docker-compose"** and paste the contents of
   `docker-compose.yaml`.
3. Pick a **CPU (TDX)** instance — the smallest is fine and covered by the free
   **$20 CVM credits**. **Do NOT pick a GPU instance.**
4. Add an **encrypted secret** `AUTH_TOKEN` = some random string (keep it — the
   backend needs the same value).
5. Deploy. When it's running, copy the CVM's **public URL** (e.g.
   `https://xxxxx-8090.dstack-prod5.phala.network` or similar).

### 4. Verify the TEE is live
```bash
curl https://<your-cvm-url>/health
# → {"ok":true,"tee":true}    ← tee:true means attestation is active
```

### 5. Hand back to the backend
Give me (or set in the repo root `.env`) just these two — leave
`STRATEGIST_PROVIDER=mock` (the TEE verdict path is gated on `PHALA_API_URL`, not
on the strategist flag, so it won't disturb the agent runtime):
```
PHALA_API_URL=https://<your-cvm-url>
PHALA_API_KEY=<the AUTH_TOKEN you set>
```
The backend then calls this CVM in phase 10, captures the TDX quote, anchors
`keccak256(quote)` on-chain (Robinhood Chain), and labels the verdict `VERIFIED`.

---

## Notes
- `src/verdict.mjs` is a copy of the server's deterministic verdict logic and
  must stay in sync with `apps/server/src/pipeline/verdict.ts`.
- Keep **auto-topup OFF** in Phala billing — if usage ever exceeded credits the
  CVM pauses instead of charging your card.
