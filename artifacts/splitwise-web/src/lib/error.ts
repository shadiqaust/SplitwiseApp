export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err && typeof err === "object") {
    const e = err as {
      response?: { data?: { error?: unknown; message?: unknown } };
      message?: unknown;
    };
    const data = e.response?.data;
    if (data && typeof data === "object") {
      if (typeof data.error === "string") return data.error;
      if (typeof data.message === "string") return data.message;
    }
    if (typeof e.message === "string") return e.message;
  }
  if (typeof err === "string") return err;
  return fallback;
}
