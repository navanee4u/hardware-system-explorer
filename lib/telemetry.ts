/**
 * telemetry.ts — log & stream EVERYTHING (co-hero feature).
 *
 * One in-process EventBus per run. Every meaningful backend action emits a
 * structured Event through it. The bus fans out to:
 *   - live SSE subscribers (the UI watches three candidates evolve at once), and
 *   - a persistence sink (the Store writes the full stream + provider/model I/O).
 *
 * The bus is the single channel: providers, the loop, the proposer, the verifier
 * harness, and the ranker all emit here so nothing is hidden.
 */

import type { Event, EventType, Profile, Source } from "./schema";

/** A consumer of events (SSE writer, persistence sink, in-memory collector). */
export type EventSink = (event: Event) => void;

export interface EmitFields {
  type: EventType;
  message: string;
  candidate?: Profile;
  provider?: string;
  source?: Source;
  data?: Record<string, unknown>;
}

/**
 * EventBus collects the full event log for a run and fans each event out to live
 * subscribers as it happens. `clock` is injectable so tests/golden runs stay
 * deterministic (no wall-clock in scripts).
 */
export class EventBus {
  readonly runId: string;
  private readonly events: Event[] = [];
  private readonly sinks = new Set<EventSink>();
  private readonly clock: () => string;
  private seq = 0;

  constructor(runId: string, clock: () => string = () => new Date().toISOString()) {
    this.runId = runId;
    this.clock = clock;
  }

  /** Emit a structured event. Returns the stored Event. */
  emit(fields: EmitFields): Event {
    const event: Event = {
      ts: this.clock(),
      runId: this.runId,
      type: fields.type,
      message: fields.message,
      candidate: fields.candidate,
      provider: fields.provider,
      source: fields.source,
      data: fields.data,
    };
    this.events.push(event);
    this.seq++;
    for (const sink of this.sinks) {
      try {
        sink(event);
      } catch {
        // A failing sink (e.g. closed SSE connection) must not break the run.
      }
    }
    return event;
  }

  /** Subscribe a live sink. Returns an unsubscribe fn. */
  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  /** Full ordered event log captured so far. */
  all(): Event[] {
    return [...this.events];
  }

  count(): number {
    return this.seq;
  }
}

// ---------------------------------------------------------------------------
// SSE encoding
// ---------------------------------------------------------------------------

/** Encode one Event as an SSE `data:` frame (newline-terminated). */
export function encodeSSE(event: Event): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A keepalive comment frame to hold the SSE connection open during quiet spans. */
export function sseKeepalive(): string {
  return `: keepalive\n\n`;
}
