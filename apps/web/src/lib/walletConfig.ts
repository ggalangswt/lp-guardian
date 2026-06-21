import { privateKeyToAccount } from "viem/accounts";
import { createConfig, http } from "wagmi";
import { mantle, mantleSepoliaTestnet } from "wagmi/chains";
import { injected, mock } from "wagmi/connectors";

// Wallet stack — viem under the hood, wagmi for the React surface. The
// migrate flow targets Mantle Sepolia (testnet) by default so judges can sign
// without spending real MNT; Mantle mainnet stays available for users who want
// to actually migrate. The `injected` connector covers the full long
// tail of browser wallets including MetaMask, Rabby, Brave, Coinbase
// Wallet — no separate connector entries needed, which keeps the type
// graph clean (the metaMask connector leaks @metamask/sdk internal
// types).
//
// E2E mock path: when the page is loaded with `?mockWallet=1` (or
// VITE_LPGUARDIAN_E2E_MOCK_WALLET=1 at build time), the injected connector
// is swapped for wagmi's mock connector backed by a local
// privateKeyAccount. The Anvil/Hardhat default key #0 is widely-known
// throwaway material — used here only so signTypedData produces a real
// EIP-712 signature without a wallet popup. The flag is sticky across
// SPA navigation via localStorage. Production builds never hit the
// mock branch unless the env var is explicitly set at build time.

const ANVIL_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function isMockWalletRequested(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mockWallet") === "1") return true;
    try {
      if (window.localStorage.getItem("lpguardian.mockWallet") === "1") {
        return true;
      }
    } catch {
      // localStorage may be unavailable; fall through to env check
    }
  }
  return import.meta.env.VITE_LPGUARDIAN_E2E_MOCK_WALLET === "1";
}

const mockEnabled = isMockWalletRequested();

if (mockEnabled && typeof window !== "undefined") {
  try {
    window.localStorage.setItem("lpguardian.mockWallet", "1");
  } catch {
    // best-effort — survives SPA navigation only when localStorage is writable
  }
}

const mockAccount = mockEnabled ? privateKeyToAccount(ANVIL_KEY_0) : undefined;

export const walletConfig = createConfig({
  chains: [mantleSepoliaTestnet, mantle],
  connectors: mockAccount
    ? [
        mock({
          accounts: [mockAccount.address],
          features: { defaultConnected: true },
        }),
      ]
    : [injected()],
  transports: {
    [mantleSepoliaTestnet.id]: http(),
    [mantle.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof walletConfig;
  }
}

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/// Exposed so an E2E test can assert the signer matches what the page
/// used to sign, AND so the migrate hook can bypass the wagmi mock
/// connector (whose signTypedData returns a fake signature) and call
/// `account.signTypedData` directly for a real EIP-712 signature the
/// backend can recover. Undefined in production builds.
export const E2E_MOCK_ACCOUNT = mockAccount;
export const E2E_MOCK_SIGNER = mockAccount?.address;
