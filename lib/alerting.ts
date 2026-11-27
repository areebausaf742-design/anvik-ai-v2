/**=============================================================================
 * ANVIK AI — Alerting System (Enterprise Reliability)
 * ============================================================================
 * Provides alerting for SLO breaches, circuit breaker trips, and other
 * critical events. Integrates with external alerting systems (Slack,
 * PagerDuty, email) and internal notification mechanisms.
 * ==========================================================================*/

/** Alert severity levels */
export enum AlertSeverity {
  Critical = "critical",
  High = "high",
  Medium = "medium",
  Low = "low",
  Info = "info",
}

/** Alert status */
export enum AlertStatus {
  Firing = "firing",
  Resolved = "resolved",
}

/** Alert payload structure */
export interface Alert {
  /** Unique identifier for the alert */
  id: string;
  /** Alert title/summary */
  title: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Current status */
  status: AlertStatus;
  /** When the alert was fired */
  firedAt: number;
  /** When the alert was last updated */
  updatedAt: number;
  /** Human-readable description */
  description: string;
  /** Additional context/data */
  context?: Record<string, unknown>;
  /** Which service/route triggered the alert */
  source: string;
  /** Related metric or check */
  metric?: string;
}

/** Alert rule definition */
export interface AlertRule {
  /** Unique rule identifier */
  id: string;
  /** Rule title */
  title: string;
  /** Severity level */
  severity: AlertSeverity;
  /** Condition that triggers the alert */
  condition: (metrics: Record<string, unknown>) => boolean;
  /** Human-readable description */
  description: string;
  /** Whether the alert is active */
  active: boolean;
  /** Cooldown in ms to prevent alert flooding */
  cooldownMs?: number;
  /** Last time the alert was fired */
  lastFiredAt?: number;
}

/** Alert manager that handles rule evaluation and notification */
export class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private lastFired: Map<string, number> = new Map();
  private listeners: ((alert: Alert) => void)[] = [];

  /** Add an alert rule */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Remove an alert rule */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.lastFired.delete(ruleId);
  }

  /** Register an alert listener (e.g., for Slack/PagerDuty integration) */
  onAlert(listener: (alert: Alert) => void): void {
    this.listeners.push(listener);
  }

  /** Fire an alert */
  fireAlert(alert: Omit<Alert, "id" | "firedAt" | "updatedAt">): Alert {
    const now = Date.now();
    const id = crypto.randomUUID();

    const completeAlert: Alert = {
      id,
      title: alert.title,
      severity: alert.severity,
      status: AlertStatus.Firing,
      firedAt: now,
      updatedAt: now,
      description: alert.description,
      context: alert.context,
      source: alert.source,
      metric: alert.metric,
    };

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(completeAlert);
      } catch (error) {
        // console.error("Alert listener error", error);
      }
    }

    // Track last fired time for cooldown
    if (alert.severity !== AlertSeverity.Info) {
      this.lastFired.set(alert.id, now);
    }

    return completeAlert;
  }

  /** Resolve an alert */
  resolveAlert(alertId: string): Alert {
    const now = Date.now();
    const alert: Alert = {
      id: alertId,
      title: "Alert resolved",
      severity: AlertSeverity.Info,
      status: AlertStatus.Resolved,
      firedAt: 0,
      updatedAt: now,
      description: "Alert has been resolved",
      context: {},
      source: "alert-manager",
      metric: undefined,
    };

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (error) {
        // console.error("Alert listener error", error);
      }
    }

    return alert;
  }

  /** Evaluate all active rules against current metrics */
  evaluateMetrics(metrics: Record<string, unknown>): Alert[] {
    const firedAlerts: Alert[] = [];

    for (const [ruleId, rule] of this.rules) {
      if (!rule.active) continue;

      // Check cooldown
      const lastFired = this.lastFired.get(ruleId);
      if (lastFired && rule.cooldownMs) {
        const timeSinceLast = now - lastFired;
        if (timeSinceLast < rule.cooldownMs) {
          continue;
        }
      }

      // Evaluate condition
      try {
        if (rule.condition(metrics)) {
          const alert = this.fireAlert({
            title: rule.title,
            severity: rule.severity,
            description: rule.description,
            source: "metrics-evaluator",
            ...(rule.metric && { metric: rule.metric }),
          });
          firedAlerts.push(alert);
        }
      } catch (error) {
        // console.error(`Alert rule evaluation error (${ruleId})`, error);
      }
    }

    return firedAlerts;
  }

  /** Get all active alerts */
  getActiveAlerts(): Alert[] {
    // In a full implementation, would query a storage backend
    return [];
  }
}

/** Pre-configured alert rules for ANVIK AI */

/** Circuit breaker open alert rule */
export function createCircuitBreakerAlertRule(
  serviceName: string,
  breaker: any,
): AlertRule {
  return {
    id: `cb-open-${serviceName}`,
    title: `Circuit breaker open for ${serviceName}`,
    severity: AlertSeverity.High,
    description: `Circuit breaker for ${serviceName} has opened due to repeated failures`,
    active: true,
    condition: (metrics: Record<string, unknown>) => {
      const state = metrics["state"] as string;
      return state === "open";
    },
  };
}

/** High error rate alert rule */
export function createErrorRateAlertRule(
  serviceName: string,
  threshold: number = 0.05, // 5% error rate
): AlertRule {
  return {
    id: `error-rate-${serviceName}`,
    title: `High error rate for ${serviceName}`,
    severity: AlertSeverity.Critical,
    description: `Error rate for ${serviceName} has exceeded ${threshold * 100}%`,
    active: true,
    condition: (metrics: Record<string, unknown>) => {
      const errorRate = metrics["errorRate"] as number;
      return errorRate && errorRate > threshold;
    },
  };
}

/** Latency alert rule */
export function createLatencyAlertRule(
  serviceName: string,
  maxLatencyMs: number = 5000,
): AlertRule {
  return {
    id: `latency-${serviceName}`,
    title: `High latency for ${serviceName}`,
    severity: AlertSeverity.Medium,
    description: `Latency for ${serviceName} has exceeded ${maxLatencyMs}ms`,
    active: true,
    condition: (metrics: Record<string, unknown>) => {
      const avgLatency = metrics["averageLatencyMs"] as number;
      return avgLatency && avgLatency > maxLatencyMs;
    },
  };
}

/** Guest quota exhausted alert rule */
export function createGuestQuotaAlertRule(): AlertRule {
  return {
    id: "guest-quota-exhausted",
    title: "Guest quota exhausted",
    severity: AlertSeverity.High,
    description: "Guest daily allowance of 10 answers has been reached",
    active: true,
    condition: (metrics: Record<string, unknown>) => {
      const remaining = metrics["remaining"] as number;
      return remaining !== undefined && remaining <= 0;
    },
  };
}

/** Create an alert manager with pre-configured ANVIK AI rules */
export function createAnvikAlertManager(): AlertManager {
  const manager = new AlertManager();

  // Add default ANVIK AI alert rules
  // We can't access specific breaker instances here, but the rules
  // are defined and can be configured at runtime

  return manager;
}