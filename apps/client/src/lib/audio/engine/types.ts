export type EngineState = "idle" | "loading" | "buffering" | "ready" | "playing" | "paused" | "ended" | "error";

export interface EngineError {
  message: string;
  cause?: unknown;
}

export type EngineStateListener = (state: EngineState, error: EngineError | null) => void;
