import { useEffect, useRef, useState } from "react";
import type { DiagnosticEvent } from "@lp-guardian/core";
import { API_BASE_URL } from "../lib/api.js";

export type StreamStatus = "idle" | "open" | "closed" | "error";

interface State {
  events: DiagnosticEvent[];
  status: StreamStatus;
  error?: string;
}

function isSuccessfulTerminal(events: DiagnosticEvent[]): boolean {
  return events.some(
    (event) => event.type === "phase.end" && event.phase === 9,
  );
}

// Subscribes to the backend diagnose SSE endpoint and accumulates the typed
// DiagnosticEvent stream. The hook auto-closes on unmount.
export function useDiagnosticStream(
  tokenId: string | null,
  walletAddress?: string,
  protocol?: string,
): State {
  const [state, setState] = useState<State>({ events: [], status: "idle" });
  const eventsRef = useRef<DiagnosticEvent[]>([]);
  const explicitErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!tokenId) {
      setState({ events: [], status: "idle" });
      eventsRef.current = [];
      explicitErrorRef.current = undefined;
      return;
    }

    const params = new URLSearchParams();
    if (walletAddress) params.set("walletAddress", walletAddress);
    if (protocol) params.set("protocol", protocol);
    const query = params.toString();
    const url = `${API_BASE_URL}/api/diagnose/${tokenId}${query ? `?${query}` : ""}`;
    const es = new EventSource(url);
    setState({ events: [], status: "open" });
    eventsRef.current = [];
    explicitErrorRef.current = undefined;

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as DiagnosticEvent;
        if (event.type === "error") {
          explicitErrorRef.current = event.message;
        }
        setState((s) => {
          const nextEvents = [...s.events, event];
          eventsRef.current = nextEvents;
          return {
            ...s,
            events: nextEvents,
            status:
              event.type === "error"
                ? "error"
                : s.status,
            error:
              event.type === "error"
                ? event.message
                : s.error,
          };
        });
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      setState((s) => {
        if (explicitErrorRef.current) {
          return {
            ...s,
            status: "error",
            error: explicitErrorRef.current,
          };
        }
        if (isSuccessfulTerminal(eventsRef.current)) {
          return {
            ...s,
            status: "closed",
            error: undefined,
          };
        }
        return { ...s, status: "error", error: "stream error" };
      });
      es.close();
    };

    return () => {
      es.close();
    };
  }, [tokenId, walletAddress, protocol]);

  return state;
}
