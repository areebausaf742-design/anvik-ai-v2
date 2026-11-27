/**=============================================================================
 * ANVIK AI — Distributed Tracing (Enterprise Observability)
 * ============================================================================
 * Provides correlation ID middleware and trace context propagation
 * across service boundaries. Ensures requests can be traced from
 * edge through to backend services.
 * ==========================================================================*/

/** Header names for trace context propagation */
export const TraceHeaders = {
  /** W3C Trace-Id header */
  traceId: "x-request-id",

  /** W3C Span-Id header */
  spanId: "x-span-id",

  /** Parent trace ID for distributed tracing */
  parentId: "x-parent-id",

  /** Sample decision for tracing */
  sampled: "x-sampled",
};

/** Default sampling ratio (1% of requests traced) */
export const DEFAULT_SAMPLING_RATIO = 0.01;

/** Trace context holding correlation IDs */
export type TraceContext = {
  traceId: string;
  spanId: string;
  parentId?: string;
  sampled: boolean;
};

/** Initialize or retrieve the trace context from request headers */
export function initTraceContext(
  request: Request,
  options: { samplingRatio?: number; overrideTraceId?: string } = {},
): TraceContext {
  const { samplingRatio = DEFAULT_SAMPLING_RATIO, overrideTraceId } = options;

  // Check for existing trace context in headers
  const existingTraceId = request.headers.get(TraceHeaders.traceId);
  const existingSpanId = request.headers.get(TraceHeaders.spanId);
  const existingParentId = request.headers.get(TraceHeaders.parentId);
  const existingSampled = request.headers.get(TraceHeaders.sampled);

  let traceId: string;
  let spanId: string;
  let parentId: string | undefined;
  let sampled: boolean;

  if (overrideTraceId) {
    // Use overridden trace ID (for testing/debugging)
    traceId = overrideTraceId;
    spanId = crypto.randomUUID().slice(0, 16);
    parentId = existingTraceId || undefined;
    sampled = true;
  } else if (existingTraceId && existingSpanId) {
    // Continue existing distributed trace
    traceId = existingTraceId;
    spanId = existingSpanId;
    parentId = existingParentId || undefined;
    sampled = existingSampled === "1" || existingSampled === "true";
  } else {
    // Start new trace
    // Sample based on ratio
    const shouldSample = Math.random() < samplingRatio;
    traceId = crypto.randomUUID();
    spanId = crypto.randomUUID().slice(0, 16);
    parentId = undefined;
    sampled = shouldSample;
  }

  // Set sampling header if we're sampling
  if (sampled) {
    // Set the headers on the request for downstream use
    // In a real implementation, this would be done at the framework level
  }

  return {
    traceId,
    spanId,
    parentId,
    sampled,
  };
}

/** Extract trace context from Express/Next.js request */
export function extractTraceContext(
  req: Request,
): {
  traceContext: TraceContext;
  headers: Record<string, string>;
} {
  const traceId = req.headers.get(TraceHeaders.traceId);
  const spanId = req.headers.get(TraceHeaders.spanId);
  const parentId = req.headers.get(TraceHeaders.parentId);

  const traceContext: TraceContext = {
    traceId: traceId || crypto.randomUUID(),
    spanId: spanId || crypto.randomUUID().slice(0, 16),
    parentId: parentId || undefined,
    sampled: !!traceId, // If there's an existing trace ID, we're continuing a trace
  };

  return {
    traceContext,
    headers: {
      [TraceHeaders.traceId]: traceContext.traceId,
      [TraceHeaders.spanId]: traceContext.spanId,
      ...(traceContext.parentId && { [TraceHeaders.parentId]: traceContext.parentId }),
    },
  };
}

/** Middleware to add trace context headers to responses */
export function traceContextMiddleware(): (req: Request, res: Response, next: any) => void {
  return (req: Request, res: Response, next: any) => {
    // Initialize trace context
    const context = initTraceContext(req);

    // Add trace headers to response
    res.setHeader(TraceHeaders.traceId, context.traceId);
    res.setHeader(TraceHeaders.spanId, context.spanId);
    if (context.parentId) {
      res.setHeader(TraceHeaders.parentId, context.parentId);
    }
    if (context.sampled) {
      res.setHeader(TraceHeaders.sampled, "1");
    }

    // Store context on response for downstream use
    // @ts-ignore - adding custom property
    res.locals.traceContext = context;

    next();
  };
}

/** Create a span for tracking operations within a request */
export function createSpan(
  name: string,
  context?: {
    traceContext?: TraceContext;
    attributes?: Record<string, unknown>;
  },
): {
  finish: () => void;
  updateAttribute: (key: string, value: unknown) => void;
  setStatus: (status: "ok" | "error") => void;
} {
  const traceContext = context?.traceContext || {
    traceId: crypto.randomUUID(),
    spanId: crypto.randomUUID().slice(0, 16),
    sampled: false,
  };

  let attributes: Record<string, unknown> = context?.attributes || {};

  return {
    finish: () => {
      // In a full implementation, would report to tracing system
      // e.g., OpenTelemetry, Jaeger, etc.
    },
    updateAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
    setStatus: (status: "ok" | "error") => {
      // Set span status
    },
  };
}

/** No-op tracer for when tracing is disabled */
export class NoopTracer {
  startSpan(_name: string, _attributes?: Record<string, unknown>) {
    return {
      finish: () => {},
      updateAttribute: () => {},
      setStatus: () => {},
    };
  }
}

/** Create a no-op tracer */
export function createNoopTracer(): NoopTracer {
  return new NoopTracer();
}