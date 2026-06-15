export interface AgentRunQueueSnapshot {
  provider: string;
  pendingRunIds: string[];
  pendingCount: number;
  processing: boolean;
}

export interface AgentRunQueue {
  readonly provider: string;
  enqueue(runId: string): void;
  dequeue(): string | undefined;
  size(): number;
  snapshot(processing: boolean): AgentRunQueueSnapshot;
}

export class InMemoryAgentRunQueue implements AgentRunQueue {
  readonly provider = "in-memory";
  private readonly pendingRunIds: string[] = [];
  private readonly pending = new Set<string>();

  enqueue(runId: string): void {
    if (this.pending.has(runId)) return;
    this.pending.add(runId);
    this.pendingRunIds.push(runId);
  }

  dequeue(): string | undefined {
    const runId = this.pendingRunIds.shift();
    if (runId) this.pending.delete(runId);
    return runId;
  }

  size(): number {
    return this.pendingRunIds.length;
  }

  snapshot(processing: boolean): AgentRunQueueSnapshot {
    return {
      provider: this.provider,
      pendingRunIds: [...this.pendingRunIds],
      pendingCount: this.pendingRunIds.length,
      processing,
    };
  }
}
