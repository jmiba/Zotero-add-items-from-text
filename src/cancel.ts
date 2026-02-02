export class CancelledError extends Error {
  constructor(message = "Operation cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export class CancelToken {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  isCanceled(): boolean {
    return this.cancelled;
  }

  throwIfCanceled(): void {
    if (this.cancelled) {
      throw new CancelledError();
    }
  }
}

export function isCancellationError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof CancelledError) return true;
  const anyErr = error as { name?: string; message?: string };
  if (anyErr?.name === "CancelledError") return true;
  if (typeof anyErr?.message === "string" && /cancelled|canceled/i.test(anyErr.message)) return true;
  return false;
}
