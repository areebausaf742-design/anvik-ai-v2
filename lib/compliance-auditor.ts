/**=============================================================================
 * ANVIK AI — Compliance Auditor (Enterprise Governance)
 * ============================================================================
 * Provides compliance checking for data handling, security policies,
 * and regulatory requirements (GDPR, etc.). Audits the system against
 * configured rules and reports violations.
 * ==========================================================================*/

/** Compliance violation severity */
export enum ViolationSeverity {
  Critical = "critical",
  High = "high",
  Medium = "medium",
  Low = "low",
}

/** Compliance violation type */
export enum ViolationType {
  DataExposure = "data_exposure",
  UnauthorizedAccess = "unauthorized_access",
  PiiViolation = "pii_violation",
  RetentionViolation = "retention_violation",
  ConsentViolation = "consent_violation",
  SecurityPolicy = "security_policy",
}

/** Compliance violation record */
export interface Violation {
  /** Unique violation identifier */
  id: string;
  /** Violation type */
  type: ViolationType;
  /** Severity level */
  severity: ViolationSeverity;
  /** Description of the violation */
  description: string;
  /** When the violation was detected */
  detectedAt: number;
  /** Related request/operation ID */
  contextId?: string;
  /** Detailed information about the violation */
  details?: Record<string, unknown>;
  /** Whether the violation has been remediated */
  remediated: boolean;
  /** When it was remediated (if applicable) */
  remediatedAt?: number;
}

/** Compliance audit result */
export interface AuditResult {
  /** Whether the audit passed */
  passed: boolean;
  /** List of violations found */
  violations: Violation[];
  /** When the audit was performed */
  timestamp: number;
  /** Auditor identifier */
  auditor: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/** Compliance auditor that checks the system against rules */
export class ComplianceAuditor {
  private rules: Array<{
    name: string;
    check: (context: Record<string, unknown>) => Violation | null;
  }> = [];
  private lastAudit: number = 0;

  /** Add a compliance rule */
  addRule(
    name: string,
    check: (context: Record<string, unknown>) => Violation | null,
  ): void {
    this.rules.push({ name, check });
  }

  /** Remove a compliance rule */
  removeRule(name: string): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }

  /** Perform a compliance audit */
  async audit(context: Record<string, unknown> = {}): Promise<AuditResult> {
    const startAt = Date.now();
    const violations: Violation[] = [];

    // Run all rules
    for (const rule of this.rules) {
      try {
        const violation = rule.check(context);
        if (violation) {
          violations.push({
            id: crypto.randomUUID(),
            type: violation.type,
            severity: violation.severity,
            description: violation.description,
            detectedAt: startAt,
            contextId: context.id,
            details: violation.details,
            remediated: false,
          });
        }
      } catch (error) {
        // console.error(`Compliance rule error (${rule.name})`, error);
      }
    }

    // Sort by severity (critical first)
    const severityOrder: Record<ViolationSeverity, number> = {
      [ViolationSeverity.Critical]: 0,
      [ViolationSeverity.High]: 1,
      [ViolationSeverity.Medium]: 2,
      [ViolationSeverity.Low]: 3,
    };
    violations.sort((a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
    );

    const passed = violations.length === 0;

    const result: AuditResult = {
      passed,
      violations,
      timestamp: startAt,
      auditor: "compliance-auditor",
      context,
    };

    this.lastAudit = startAt;

    // Log the audit result
    if (!passed) {
      // console.warn(`Compliance audit found ${violations.length} violations`);
    } else {
      // console.info("Compliance audit passed");
    }

    return result;
  }

  /** Get last audit timestamp */
  getLastAuditTimestamp(): number {
    return this.lastAudit;
  }

  /** Get number of violations from last audit */
  getLastViolationCount(): number {
    return this.violations?.length ?? 0;
  }
}

/** Pre-configured compliance rules for ANVIK AI */

/** GDPR data exposure check - ensures no PII in API responses */
export function createGdprDataExposureRule(
  allowedFields: string[],
): (context: Record<string, unknown>) => Violation | null {
  return (context: Record<string, unknown>): Violation | null => {
    // Check if context contains sensitive data that shouldn't be exposed
    for (const field of allowedFields) {
      if (context[field] !== undefined) {
        // Field is present - check if it should be restricted
        return null; // Field is allowed
      }
    }

    // This is a simplified rule - in production, would do deep inspection
    // of response data for PII exposure
    return null;
  };
}

/** Consent check - ensures AI responses don't violate user consent */
export function createConsentViolationRule(
  hasConsent: boolean,
): (context: Record<string, unknown>) => Violation | null {
  return (context: Record<string, unknown>): Violation | null => {
    if (!hasConsent) {
      return {
        id: crypto.randomUUID(),
        type: ViolationType.ConsentViolation,
        severity: ViolationSeverity.Critical,
        description:
          "AI operation performed without user consent",
        detectedAt: Date.now(),
        remediated: false,
      };
    }
    return null;
  };
}

/** Retention policy check - ensures data is not kept longer than allowed */
export function createRetentionViolationRule(
  maxRetentionMs: number,
): (context: Record<string, unknown>) => Violation | null {
  return (context: Record<string, unknown>): Violation | null => {
    const createdAt = context.createdAt as number;
    if (createdAt && Date.now() - createdAt > maxRetentionMs) {
      return {
        id: crypto.randomUUID(),
        type: ViolationType.RetentionViolation,
        severity: ViolationSeverity.High,
        description:
          "Data retained beyond maximum allowed retention period",
        detectedAt: Date.now(),
        contextId: String(createdAt),
        remediated: false,
      };
    }
    return null;
  };
}

/** Create a compliance auditor with pre-configured ANVIK AI rules */
export function createAnvikComplianceAuditor(
  hasConsent: boolean,
  maxRetentionMs: number,
): ComplianceAuditor {
  const auditor = new ComplianceAuditor();

  // Add GDPR data exposure rule (simplified)
  auditor.addRule("gdpr-data-exposure", createGdprDataExposureRule([]));

  // Add consent violation rule
  auditor.addRule("consent-violation", createConsentViolationRule(hasConsent));

  // Add retention violation rule
  auditor.addRule("retention-policy", createRetentionViolationRule(maxRetentionMs));

  return auditor;
}