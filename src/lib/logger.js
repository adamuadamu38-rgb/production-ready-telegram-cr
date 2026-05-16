export function safeErr(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    String(err)
  );
}

function write(level, message, meta = {}) {
  const payload = {
    level,
    message,
    ...meta,
    ts: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message, meta = {}) => write("info", message, meta),
  warn: (message, meta = {}) => write("warn", message, meta),
  error: (message, meta = {}) => write("error", message, meta),
};
