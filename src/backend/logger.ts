export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export function createConsoleLogger(): Logger {
  return {
    info(message: string) {
      console.info(message);
    },
    warn(message: string) {
      console.warn(message);
    },
    error(message: string) {
      console.error(message);
    },
  };
}
