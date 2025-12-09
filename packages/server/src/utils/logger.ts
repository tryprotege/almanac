import pino, { destination } from "pino";
import { env } from "../env.js";

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== "production";

// Create the base logger
export const logger = pino({
  level: env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Export convenience methods
export default logger;
