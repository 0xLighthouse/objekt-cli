type Logger = {
  info: (msg: string) => void;
  detail: (msg: string) => void;
  debug: (msg: string) => void;
};

export function createLogger(verbosity: number): Logger {
  const write = (msg: string) => process.stderr.write(`${msg}\n`);
  return {
    info: verbosity >= 1 ? (msg) => write(msg) : () => {},
    detail: verbosity >= 2 ? (msg) => write(`  ${msg}`) : () => {},
    debug: verbosity >= 3 ? (msg) => write(`[debug] ${msg}`) : () => {},
  };
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)}KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}
