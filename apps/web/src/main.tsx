import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { App } from "./App.js";
import { MockWalletAutoConnect } from "./lib/MockWalletAutoConnect.js";
import { walletConfig } from "./lib/walletConfig.js";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WagmiProvider config={walletConfig}>
        <QueryClientProvider client={queryClient}>
          <MockWalletAutoConnect />
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
