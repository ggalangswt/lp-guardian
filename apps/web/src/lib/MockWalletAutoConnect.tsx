import { useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { E2E_MOCK_ACCOUNT } from "./walletConfig.js";

// E2E helper — when the mock wallet is enabled (via ?mockWallet=1),
// wagmi's mock connector still needs an explicit `connect()` call to
// move from `disconnected` to `connected`. We fire it once on mount so
// pages that gate on `useAccount().isConnected` (the migration modal,
// for example) flip into the signed-in branch without a click. Renders
// nothing in production builds because E2E_MOCK_ACCOUNT is undefined.
export function MockWalletAutoConnect() {
  const { connectors, connect, status } = useConnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (!E2E_MOCK_ACCOUNT) return;
    if (isConnected) return;
    if (status === "pending" || status === "success") return;
    const mockConnector = connectors[0];
    if (mockConnector) connect({ connector: mockConnector });
  }, [connect, connectors, isConnected, status]);

  return null;
}
