/**=============================================================================
 * ANVIK AI — SLO Tracker (Enterprise Reliability)
 * ============================================================================
 * Provides Service Level Objective tracking and error budget management.
 * Tracks availability, latency, and other SLOs with error budget
 * calculations and burning rate monitoring.
 * ==========================================================================*/

/** SLO types */
export enum SloType {
  Availability = "availability",
  Latency = "latency",
  RequestErrorRate = "request_error_rate",
  Traffic = "traffic",
}

/** SLO objective configuration */
export interface SloConfig {
  /** SLO type */
  type: SloType;
  /** SLO name */
  name: string;
  /** Target percentage (e.g., 99.9 for 99.9% availability) */
  target: number;
  /** Window length in ms (e.g., 30 days) */
  windowMs: number;
  /** Whether this is a hard SLO (affects alerting priority) */
  hardSlo: boolean;
}

/** SLO result for a given window */
export interface SloResult {
  /** SLO type */
  type: SloType;
  /** SLO name */
  name: string;
  /** Current compliance percentage */
  compliance: number;
  /** Whether the SLO is being met */
  meetingSlo: boolean;
  /** Error budget remaining (0 = at SLO, 100 = perfect) */
  errorBudgetRemaining: number;
  /** Error budget burn rate (positive = burning, negative = recovering) */
  burnRate: number;
  /** Time remaining in current window */
  timeRemainingMs: number;
  /** Timestamp of the window start */
  windowStart: number;
  /** Timestamp of the window end */
  windowEnd: number;
}

/** Historical burn rate point */
export interface BurnRatePoint {
  /** Timestamp */
  at: number;
  /** Burn rate percentage per window */
  burnRate: number;
  /** Compliance at that point */
  compliance: number;
  /** Error budget remaining */
  errorBudgetRemaining: number;
}

/** SLO tracker that monitors and reports on service level objectives */
export class SloTracker {
  private configs: Map<string, SloConfig> = new Map();
  private history: Map<string, BurnRatePoint[]> = new Map();
  private startTime: number = Date.now();

  /** Register an SLO configuration */
  register(config: SloConfig): void {
    this.configs.set(config.name, config);

    if (!this.history.has(config.name)) {
      this.history.set(config.name, []);
    }
  }

  /** Get SLO config by name */
  getConfig(name: string): SloConfig | null {
    return this.configs.get(name) ?? null;
  }

  /** Get all registered SLO configs */
  getAllConfigs(): SloConfig[] {
    return Array.from(this.configs.values());
  }

  /** Record a data point for SLO calculation */
  recordDataPoint(configName: string, options: {
    /** Current compliance (0-100) */
    compliance: number;
    /** Current error budget remaining (0-100) */
    errorBudgetRemaining: number;
    /** Burn rate for this interval */
    burnRate: number;
  }): void {
    const points = this.history.get(configName) ?? [];
    const newPoint: BurnRatePoint = {
      at: Date.now(),
      burnRate: options.burnRate,
      compliance: options.compliance,
      errorBudgetRemaining: options.errorBudgetRemaining,
    };

    // Add the new point
    points.push(newPoint);

    // Keep only last 1000 points to prevent memory growth
    if (points.length > 1000) {
      points.shift();
    }

    this.history.set(configName, points);
  }

  /** Calculate SLO result for a configured SLO */
  calculateSlo(configName: string): SloResult | null {
    const config = this.configs.get(configName);
    if (!config) return null;

    const points = this.history.get(configName) ?? [];
    const now = Date.now();
    const windowMs = config.windowMs;
    const windowStart = now - windowMs;
    const windowEnd = now;

    // Filter points within the current window
    const windowPoints = points.filter(
      (p) => p.at >= windowStart && p.at <= windowEnd,
    );

    if (windowPoints.length === 0) {
      // No data - assume SLO is being met with full error budget
      return {
        type: config.type,
        name: config.name,
        compliance: 100,
        meetingSlo: true,
        errorBudgetRemaining: 100,
        burnRate: 0,
        timeRemainingMs: windowMs,
        windowStart,
        windowEnd,
      };
    }

    // Calculate average compliance across the window
    const totalCompliance = windowPoints.reduce(
      (sum, p) => sum + p.compliance,
      0,
    );
    const averageCompliance = totalCompliance / windowPoints.length;

    // Calculate average burn rate
    const totalBurnRate = windowPoints.reduce(
      (sum, p) => sum + p.burnRate,
      0,
    );
    const averageBurnRate = totalBurnRate / windowPoints.length;

    // Error budget remaining: 100 - (number of points below target)
    const pointsBelowTarget = windowPoints.filter((p) => p.compliance < config.target).length;
    const errorBudgetRemaining = Math.max(0, 100 - (pointsBelowTarget / windowPoints.length) * 100);

    const meetingSlo = averageCompliance >= config.target;

    return {
      type: config.type,
      name: config.name,
      compliance: Math.round(averageCompliance * 100) / 100,
      meetingSlo,
      errorBudgetRemaining: Math.round(errorBudgetRemaining * 100) / 100,
      burnRate: Math.round(averageBurnRate * 100) / 100,
      timeRemainingMs: windowMs - (now - windowStart),
      windowStart,
      windowEnd,
    };
  }

  /** Get burn rate history for a configured SLO */
  getBurnRateHistory(configName: string): BurnRatePoint[] {
    return this.history.get(configName) ?? [];
  }

  /** Get all SLO results */
  getAllSloResults(): Record<string, SloResult> {
    const results: Record<string, SloResult> = {};
    for (const configName of this.configs.keys()) {
      const result = this.calculateSlo(configName);
      if (result) {
        results[configName] = result;
      }
    }
    return results;
  }
}

/** Pre-configured SLOs for ANVIK AI */

/** Default availability SLO: 99.9% over 30 days */
export function createDefaultAvailabilitySlo(): SloConfig {
  return {
    type: SloType.Availability,
    name: "availability",
    target: 99.9,
    windowMs: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    hardSlo: true,
  };
}

/** Default latency SLO: 99% of requests under 5 seconds */
export function createDefaultLatencySlo(): SloConfig {
  return {
    type: SloType.Latency,
    name: "latency",
    target: 99,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours in ms
    hardSlo: false,
  };
}

/** Default request error rate SLO: < 1% errors */
export function createDefaultErrorRateSlo(): SloConfig {
  return {
    type: SloType.RequestErrorRate,
    name: "request-error-rate",
    target: 1, // 1% error rate target
    windowMs: 60 * 60 * 1000, // 1 hour in ms
    hardSlo: true,
  };
}

/** Create an SLO tracker with default ANVIK AI SLOs */
export function createAnvikSloTracker(): SloTracker {
  const tracker = new SloTracker();

  tracker.register(createDefaultAvailabilitySlo());
  tracker.register(createDefaultLatencySlo());
  tracker.register(createDefaultErrorRateSlo());

  return tracker;
}

/** Record an SLO data point from metrics */
export function recordSloFromMetrics(
  tracker: SloTracker,
  metricName: string,
  compliance: number,
  errorBudgetRemaining: number,
  burnRate: number,
): void {
  tracker.recordDataPoint(metricName, {
    compliance,
    errorBudgetRemaining,
    burnRate,
  });
}