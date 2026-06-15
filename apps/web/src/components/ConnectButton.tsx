import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";

function shortAddr(addr: string, head = 6, tail = 4): string {
  return addr.length <= head + tail + 1 ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

const CHAIN_NAME: Record<number, string> = {
  1: "wallet",
  11155111: "wallet",
};

export function ConnectButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainName = CHAIN_NAME[chainId] ?? `chain ${chainId}`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
  }

  if (isConnected && address) {
    return (
      <div ref={rootRef} className="wallet-menu-wrap" style={{ position: "relative", display: "inline-flex" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn btn-ghost atlas-connect-btn atlas-connect-btn-connected"
          aria-haspopup="menu"
          aria-expanded={open}
          style={{ padding: "10px 16px", fontSize: 12, fontFamily: "var(--font-mono)" }}
          title={`${address} on ${chainName}`}
        >
          <span
            className="wallet-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--healthy)",
              boxShadow: "0 0 6px var(--healthy-glow)",
              display: "inline-block",
            }}
          />
          {shortAddr(address)}
          <span className="wallet-chain" style={{ color: "var(--text-tertiary)", fontSize: 10, marginLeft: 4 }}>
            {CHAIN_NAME[chainId] ?? "wallet"}
          </span>
        </button>

        {open && (
          <div
            className="wallet-menu"
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 12px)",
              right: 0,
              zIndex: 20,
              width: 280,
              padding: 14,
              borderRadius: 14,
              border: "1px solid var(--border-strong)",
              background: "var(--surface-raised)",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.35)",
              color: "var(--text)",
              overflow: "visible",
            }}
          >
            <img
              src="/mascots/mascot1.webp"
              width={88}
              height={88}
              className="lp-mascot-bob"
              style={{
                position: "absolute",
                bottom: -60,
                right: -18,
                objectFit: "contain",
                pointerEvents: "none",
                zIndex: 21,
              }}
              role="presentation"
              aria-hidden
            />
            <div className="wallet-menu-label">Connected wallet</div>
            <div className="wallet-menu-address-row">
              <div className="wallet-menu-address" title={address}>
                {shortAddr(address, 8, 6)}
              </div>
              <button
                type="button"
                role="menuitem"
                className="wallet-menu-action wallet-menu-action-copy"
                style={{
                  width: 40,
                  minWidth: 40,
                  minHeight: 40,
                  flex: "0 0 40px",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => void copyAddress()}
                aria-label={copied ? "Address copied" : "Copy address"}
                title={copied ? "Address copied" : "Copy address"}
              >
                {copied ? "✓" : "⧉"}
              </button>
            </div>
            <div className="wallet-menu-grid">
              <span>Chain</span>
              <strong>{chainName}</strong>
              <span>Connector</span>
              <strong>{connector?.name === "Injected" ? "Browser wallet" : (connector?.name ?? "Browser wallet")}</strong>
            </div>
            <div className="wallet-menu-actions">
              <button
                type="button"
                role="menuitem"
                className="wallet-menu-action wallet-menu-action-danger"
                onClick={() => {
                  setOpen(false);
                  disconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const primary = connectors[0];
  return (
    <button
      type="button"
      onClick={() => primary && connect({ connector: primary })}
      disabled={isPending || !primary}
      className="btn btn-primary atlas-connect-btn"
      style={{ padding: "10px 18px", fontSize: 13 }}
    >
      {isPending ? "connecting…" : "Connect wallet"}
    </button>
  );
}
