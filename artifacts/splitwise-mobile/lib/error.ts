export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err && typeof err === "object") {
    const e = err as {
      response?: { data?: { error?: unknown; message?: unknown } };
      errors?: Array<{ message?: unknown }>;
      message?: unknown;
    };
    const data = e.response?.data;
    if (data && typeof data === "object") {
      if (typeof data.error === "string") return data.error;
      if (typeof data.message === "string") return data.message;
    }
    if (Array.isArray(e.errors) && e.errors.length > 0) {
      const m = e.errors[0]?.message;
      if (typeof m === "string") return m;
    }
    if (typeof e.message === "string") return e.message;
  }
  if (typeof err === "string") return err;
  return fallback;
}
