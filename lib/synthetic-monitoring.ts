/**=============================================================================
 * ANVIK AI — Synthetic Monitoring (Enterprise Reliability)
 * ============================================================================
 * Provides synthetic/active health monitoring that proactively tests
 * critical user journeys and external services on a scheduled basis.
 * Unlike passive health checks, synthetic monitoring simulates real
 * user interactions to detect issues before real users are affected.
 * ==========================================================================*/

/** Synthetic check result */
export interface SyntheticCheckResult {
  /** Check identifier */
  checkId: string;
  /** Check name */
  checkName: string;
  /** Whether the check passed */
  passed: boolean;
  /** Latency in ms */
  latencyMs: number;
  /** Error details if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/** Synthetic check configuration */
export interface SyntheticCheckConfig {
  /** Check identifier */
  checkId: string;
  /** Check name */
  checkName: string;
  /** The function to execute */
  check: () => Promise<SyntheticCheckResult>;
  /** How often to run (in ms) */
  intervalMs: number;
  /** Whether the check is enabled */
  enabled: boolean;
  /** Timeout in ms */
  timeoutMs?: number;
}

/** Synthetic monitoring manager that runs checks on a schedule */
export class SyntheticMonitor {
  private configs: Map<string, SyntheticCheckConfig> = new Map();
  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private checkResults: SyntheticCheckResult[] = [];

  /** Register a synthetic check */
  register(config: SyntheticCheckConfig): void {
    this.configs.set(config.checkId, config);

    // Start the monitor if not already running
    if (!this.running) {
      this.start();
    }
  }

  /** Unregister a check */
  unregister(checkId: string): void {
    this.configs.delete(checkId);
  }

  /** Start the synthetic monitoring loop */
  private start(): void {
    if (this.running) return;
    this.running = true;

    // Run initial checks immediately
    this.runAllChecks();

    // Set up interval for periodic checks
    this.intervalId = setInterval(() => {
      this.runAllChecks();
    }, 60_000); // Run every minute
  }

  /** Stop the synthetic monitor */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Run all registered checks */
  private async runAllChecks(): Promise<void> {
    const promises: Promise<SyntheticCheckResult>[] = [];

    for (const [checkId, config] of this.configs) {
      if (!config.enabled) continue;

      const promise = this.runCheck(config).catch((error) => {
        // console.error(`Synthetic check ${checkId} error`, error);
        return {
          checkId,
          checkName: config.checkName,
          passed: false,
          latencyMs: 0,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };
      });
      promises.push(promise);
    }

    // Wait for all checks to complete
    const results = await Promise.allSettled(promises);

    // Store results
    for (const result of results) {
      if (result.status === "fulfilled") {
        const checkResult = result.value;
        this.checkResults.push(checkResult);

        // Keep only last 100 results
        if (this.checkResults.length > 100) {
          this.checkResults.shift();
        }

        // Log the result
        // console.info(`Synthetic check ${checkResult.checkName}: ${checkResult.passed ? "PASS" : "FAIL"}`);
      }
    }
  }

  /** Run a single synthetic check */
  private async runCheck(config: SyntheticCheckConfig): Promise<SyntheticCheckResult> {
    const startAt = Date.now();

    // Create AbortSignal with timeout
    const timeoutMs = config.timeoutMs ?? 10_000;

    try {
      const result = await Promise.race([
        config.check(),
        new Promise<SyntheticCheckResult>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Check ${config.checkId} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      const latencyMs = Date.now() - startAt;

      return {
        checkId: config.checkId,
        checkName: config.checkName,
        passed: result.passed ?? true,
        latencyMs,
        ...(result.error && { error: result.error }),
        timestamp: Date.now(),
        context: result.context,
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startAt;

      return {
        checkId: config.checkId,
        checkName: config.checkName,
        passed: false,
        latencyMs,
        error: error.message,
        timestamp: Date.now(),
        context: {},
      };
    }
  }

  /** Get the latest check results */
  getLatestResults(): SyntheticCheckResult[] {
    return [...this.checkResults];
  }

  /** Get results for a specific check */
  getCheckResults(checkName: string): SyntheticCheckResult[] {
    return this.checkResults.filter(
      (r) => r.checkName === checkName,
    );
  }

  /** Check if all enabled checks are passing */
  areAllChecksPassing(): boolean {
    const results = this.getLatestResults();
    return results.every((r) => r.passed);
  }

  /** Get passing check count */
  getPassingCheckCount(): number {
    return this.getLatestResults().filter((r) => r.passed).length;
  }

  /** Get failing check count */
  getFailingCheckCount(): number {
    return this.getLatestResults().filter((r) => !r.passed).length;
  }
}

/** Pre-configured synthetic checks for ANVIK AI */

/** Health endpoint synthetic check */
export function createHealthCheckSynthetic(
  baseUrl: string,
  path = "/api/health",
): SyntheticCheckConfig {
  return {
    checkId: "health-endpoint",
    checkName: "Health endpoint",
    check: async (): Promise<SyntheticCheckResult> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5_000);

        const response = await fetch(`${baseUrl}${path}`, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return {
          passed: response.ok,
          latencyMs: 0, // Would be calculated from response timing
          context: { status: response.status },
        };
      } catch (error: any) {
        return {
          passed: false,
          latencyMs: 5_000,
          error: error.message,
        };
      }
    },
    intervalMs: 60_000, // Run every minute
    enabled: true,
    timeoutMs: 10_000,
  };
}

/** Gemini API synthetic check */
export function createGeminiHealthSynthetic(
  apiKey: string,
  baseUrl: string,
): SyntheticCheckConfig {
  return {
    checkId: "gemini-health",
    checkName: "Gemini API health",
    check: async (): Promise<SyntheticCheckResult> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3_000);

        const response = await fetch(`${baseUrl}/models?key=${apiKey}`, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        return {
          passed: response.ok,
          latencyMs: 0,
          context: { status: response.status },
        };
      } catch (error: any) {
        return {
          passed: false,
          latencyMs: 3_000,
          error: error.message,
        };
      }
    },
    intervalMs: 60_000,
    enabled: true,
    timeoutMs: 5_000,
  };
}

/** Create a synthetic monitor with pre-configured ANVIK AI checks */
export function createAnvikSyntheticMonitor(
  baseUrl: string,
  geminiApiKey: string,
  geminiBaseUrl: string,
): SyntheticMonitor {
  const monitor = new SyntheticMonitor();

  monitor.register(createHealthCheckSynthetic(baseUrl));
  monitor.register(createGeminiHealthSynthetic(geminiApiKey, geminiBaseUrl));

  return monitor;
}