import { Hono } from "hono";
import type { Address } from "viem";
import { fail, ok } from "../../http/responses.js";
import type {
  MonitorService,
  MonitorStreamEvent,
  MonitorWalletState,
} from "../../services/portfolio/monitorService.js";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function parseAddress(value: string): Address | null {
  return addressPattern.test(value) ? (value as Address) : null;
}

function encodeSse(event: string, data: unknown, id?: string): string {
  return [
    `event: ${event}`,
    ...(id ? [`id: ${id}`] : []),
    `data: ${JSON.stringify(data)}`,
  ].join("\n") + "\n\n";
}

export function createAgentMonitorRoute(monitorService: MonitorService): Hono {
  const route = new Hono();

  route.get("/", (c) => {
    return c.json(ok(monitorService.snapshot()));
  });

  route.get("/:walletAddress", (c) => {
    const walletAddress = parseAddress(c.req.param("walletAddress"));
    if (!walletAddress) {
      return c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400);
    }

    const state = monitorService.getWalletState(walletAddress);
    if (!state) {
      return c.json(
        fail("NOT_WATCHED", "Wallet is not currently tracked by the monitor agent."),
        404,
      );
    }

    return c.json(ok(state));
  });

  route.get("/:walletAddress/stream", (c) => {
    const walletAddress = parseAddress(c.req.param("walletAddress"));
    if (!walletAddress) {
      return c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400);
    }

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown, id?: string): void => {
          controller.enqueue(encoder.encode(encodeSse(event, data, id)));
        };

        const existing = monitorService.getWalletState(walletAddress);
        const snapshot: MonitorWalletState = existing ?? {
          walletAddress: walletAddress.toLowerCase() as Address,
          status: "unknown",
          watched: false,
          failureCount: 0,
          issues: [],
        };
        send("monitor.wallet.snapshot", snapshot, `snapshot__${snapshot.walletAddress}`);

        unsubscribe = monitorService.subscribeWallet(
          walletAddress,
          (event: MonitorStreamEvent) => {
            send(event.event, event.data, event.id);
          },
        );
      },
      cancel() {
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  route.post("/:walletAddress/watch", (c) => {
    const walletAddress = parseAddress(c.req.param("walletAddress"));
    if (!walletAddress) {
      return c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400);
    }

    return c.json(ok(monitorService.watch(walletAddress)));
  });

  route.delete("/:walletAddress/watch", (c) => {
    const walletAddress = parseAddress(c.req.param("walletAddress"));
    if (!walletAddress) {
      return c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400);
    }

    const state = monitorService.unwatch(walletAddress);
    if (!state) {
      return c.json(
        fail("NOT_WATCHED", "Wallet is not currently tracked by the monitor agent."),
        404,
      );
    }

    return c.json(ok(state));
  });

  return route;
}
