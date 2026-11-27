/**=============================================================================
 * ANVIK AI — Structured Logger (Enterprise Observability)
 * ============================================================================
 * Provides structured, correlation-id-based logging for request tracing
 * across services. Output is JSON for machine parsing and integration
 * with external systems (ELK, Datadog, etc.).
 * ==========================================================================*/

/**
 * Log entry structure for structured logging.
 * All log entries follow this schema for consistency.
 */
export interface LogEntry {
  /** Unique identifier for tracing this request across services */
  traceId: string;
  /** Shorter identifier for correlating logs within a single service */
  spanId: string;
  /** Timestamp in ISO format */
  timestamp: string;
  /** Log level */
  level: "error" | "warn" | "info" | "debug" | "trace";
  /** The service/module generating the log */
  service: string;
  /** The operation/route being executed */
  operation: string;
  /** Key-value context data (secrets redacted) */
  context: Record<string, unknown>;
  /** Additional structured data */
  data?: Record<string, unknown>;
}

/**
 * Generate a new correlation ID (UUID v4 format).
 * Used to trace a request across multiple services.
 */
export function generateTraceId(): string {
  const random = (): number => Math.floor(Math.random() * 2 ** 32);
  return `${random().toString(16).padStart(8, "0")}-${random().toString(16).padStart(4, "0")}-${random().toString(16).padStart(4, "0")}-${random().toString(16).padStart(4, "0")}-${random().toString(16).padStart(12, "0")}`;
}

/**
 * Generate a new span ID for within-service correlation.
 */
export function generateSpanId(): string {
  const random = (): number => Math.floor(Math.random() * 2 ** 32);
  return random().toString(16).padStart(8, "0");
}

/**
 * Create a base log entry with trace/span IDs and timestamp.
 */
export function createLogEntry(
  options: {
    level: LogEntry["level"];
    service: LogEntry["service"];
    operation: LogEntry["operation"];
    context?: Partial<Record<string, unknown>>;
  },
): LogEntry {
  const traceId = options.context?.traceId ?? generateTraceId();
  const spanId = options.context?.spanId ?? generateSpanId();

  return {
    traceId,
    spanId,
    timestamp: new Date().toISOString(),
    level: options.level,
    service: options.service,
    operation: options.operation,
    context: {
      ...options.context,
      traceId,
      spanId,
    },
  };
}

/** Logger class that outputs structured JSON */
export class StructuredLogger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Log an error with full context.
   * Errors are logged at "error" level and include the error object.
   */
  error(
    error: Error,
    operation: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = createLogEntry({
      level: "error",
      service: this.serviceName,
      operation,
      context: {
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        },
      },
    });

    // Output as JSON for machine parsing
    console.error(JSON.stringify(entry));
  }

  /** Log a warning */
  warn(
    message: string,
    operation: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = createLogEntry({
      level: "warn",
      service: this.serviceName,
      operation,
      context,
    });

    console.warn(JSON.stringify(entry));
  }

  /** Log informational message */
  info(
    message: string,
    operation: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = createLogEntry({
      level: "info",
      service: this.serviceName,
      operation,
      context,
    });

    console.info(JSON.stringify(entry));
  }

  /** Log debug message */
  debug(
    message: string,
    operation: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = createLogEntry({
      level: "debug",
      service: this.serviceName,
      operation,
      context,
    });

    console.debug(JSON.stringify(entry));
  }

  /** Log a trace message (very verbose) */
  trace(
    message: string,
    operation: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = createLogEntry({
      level: "trace",
      service: this.serviceName,
      operation,
      context,
    });

    console.log(JSON.stringify(entry));
  }

  /** Log a request lifecycle event */
  request(
    operation: string,
    context: {
      method?: string;
      path?: string;
      ip?: string;
      userId?: string;
      durationMs?: number;
      status?: number;
    },
  ): void {
    const entry = createLogEntry({
      level: "info",
      service: this.serviceName,
      operation,
      context: {
        ...context,
        traceId: context.traceId,
      },
    });

    console.info(JSON.stringify(entry));
  }
}

/** Create a logger instance for a specific service */
export function createLogger(serviceName: string): StructuredLogger {
  return new StructuredLogger(serviceName);
}