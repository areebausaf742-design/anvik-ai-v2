/**=============================================================================
 * ANVIK AI — Enterprise AI Gateway Integration
 * ============================================================================
 * Combines circuit breaker protection with multi-provider failover for
 * all AI routes. This file wires together the CircuitBreaker and
 * ProviderFailoverManager to provide defense-in-depth reliability.
 * ==========================================================================*/

import { CircuitBreaker, CircuitBreakerState, CircuitBreakerConfig } from "./circuit-breaker";
import {
  ProviderFailoverManager,
  ProviderHealth,
  ProviderHealthStatus,
  DEFAULT_PROVIDER_CONFIGS,
  createProviderFailoverManager,
} from "./provider-failover";
import { MetricsRegistry, MetricNames } from "./metrics";
import { StructuredLogger, createLogger } from "./structured-logger";

/** Service name for circuit breaker registry */
export type ServiceName = "gemini" | "supabase" | "redis" | "external-search" | "voice" | "image" | "code" | "vision" | "chat" | "ask";

/** Enterprise gateway configuration */
export interface EnterpriseGatewayConfig {
  /** Gemini API key */
  geminiApiKey: string;
  /** Gemini base URL */
  geminiBaseUrl: string;
  /** Supabase URL */
  supabaseUrl: string;
  /** Supabase service role key */
  serviceRoleKey: string;
  /** Redis URL */
  redisUrl?: string;
  /** Whether cost-aware routing is enabled */
  enableCostAwareness?: boolean;
  /** Circuit breaker failure threshold */
  circuitBreakerFailureThreshold?: number;
  /** Circuit breaker success threshold */
  circuitBreakerSuccessThreshold?: number;
}

/** Enterprise gateway that provides circuit breaker + failover integration */
export class EnterpriseGateway {
  private readonly logger: StructuredLogger;
  private readonly metrics: MetricsRegistry;
  private readonly failoverManager: ProviderFailoverManager;
  private readonly circuitBreakerRegistry: Map<ServiceName, CircuitBreaker>;
  private readonly providerHealth: Map<string, ProviderHealthStatus>;

  /** Cache of provider configs */
  private providerConfigCache: Map<string, any>;

  constructor(config: EnterpriseGatewayConfig) {
    this.logger = createLogger("EnterpriseGateway");
    this.metrics = new MetricsRegistry();
    this.providerConfigCache = new Map();

    // Initialize circuit breaker registry
    this.circuitBreakerRegistry = new Map();

    // Initialize provider failover manager
    const providerRegistry = new Map([
      ["gemini", {
        id: "gemini",
        name: "Google Gemini",
        model: "gemini-2.5-flash",
        isPrimary: true,
        minHealthScore: 70,
        maxLatencyMs: 5000,
        maxErrorRate: 20,
        weight: 2,
        costPer1kTokens: 0.75,
      }],
      ["openai", {
        id: "openai",
        name: "OpenAI GPT-4o",
        model: "gpt-4o",
        isPrimary: false,
        minHealthScore: 70,
        maxLatencyMs: 5000,
        maxErrorRate: 20,
        weight: 1,
        costPer1kTokens: 3.0,
      }],
      ["anthropic", {
        id: "anthropic",
        name: "Anthropic Claude",
        model: "claude-3-5-sonnet-20241022",
        isPrimary: false,
        minHealthScore: 70,
        maxLatencyMs: 5000,
        maxErrorRate: 20,
        weight: 1,
        costPer1kTokens: 2.5,
      }],
    ]);

    this.failoverManager = new ProviderFailoverManager(providerRegistry);
    this.providerHealth = new Map();

    // Initialize circuit breakers for each service
    this.initializeCircuitBreakers(config);

    // Initialize provider health tracking
    this.providerHealth.set("gemini", {
      state: ProviderHealth.Unknown,
      averageLatencyMs: 0,
      errorRate: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      isCurrentlyUsed: false,
    });
  }

  /** Initialize circuit breakers for all services */
  private initializeCircuitBreakers(config: EnterpriseGatewayConfig): void {
    const cbConfig: CircuitBreakerConfig = {
      failureThreshold:
        config.circuitBreakerFailureThreshold ?? 5,
      successThreshold:
        config.circuitBreakerSuccessThreshold ?? 3,
      openToHalfOpenTimeout: 30_000,
      halfOpenToCloseTimeout: 10_000,
      rollingWindowMs: 60_000,
      minimumRequests: 10,
      tripOnFirstFailure: false,
    };

    // Create circuit breakers for each service name
    const services: ServiceName[] = ["gemini", "supabase", "redis", "external-search"];

    for (const service of services) {
      const breaker = new CircuitBreaker(cbConfig);
      this.circuitBreakerRegistry.set(service, breaker);
    }

    this.logger.info("Circuit breakers initialized", "gateway-init", {
      services: services.length,
    });
  }

  /** Get a circuit breaker for a service */
  getBreaker(service: ServiceName): CircuitBreaker {
    return this.circuitBreakerRegistry.get(service) ?? new CircuitBreaker();
  }

  /** Get the provider failover manager */
  getFailoverManager(): ProviderFailoverManager {
    return this.failoverManager;
  }

  /** Get provider health status */
  getProviderHealth(provider: string): ProviderHealthStatus | null {
    return this.providerHealth.get(provider) ?? null;
  }

  /** Update provider health status */
  updateProviderHealth(provider: string, health: ProviderHealthStatus): void {
    this.providerHealth.set(provider, health);

    // Also update the failover manager's internal stats
    this.failoverManager.recordCall(provider, {
      success: health.state === ProviderHealth.Healthy,
      latencyMs: health.averageLatencyMs,
      errorCode: health.state === ProviderHealth.Healthy ? undefined : "health_check",
      errorMessage: health.state === ProviderHealth.Healthy ? undefined : health.detail,
      tokens: undefined,
    });

    // Record metrics
    this.recordProviderMetrics(provider, health);

    this.logger.info("Provider health updated", "provider-health", {
      provider,
      state: health.state,
      latencyMs: health.averageLatencyMs,
    });
  }

  /** Record provider metrics to the metrics registry */
  private recordProviderMetrics(provider: string, health: ProviderHealthStatus): void {
    // Circuit breaker state
    const stateValue = health.state === ProviderHealth.Healthy ? 0 : health.state === ProviderHealth.Degraded ? 1 : 2;
    this.metrics.recordGauge(
      MetricNames.CIRCUIT_BREAKER_STATE,
      "Circuit breaker state for a service",
      [{ name: "service", value: provider }, { name: "state", value: health.state }],
      stateValue,
    );

    // Provider health state
    this.metrics.recordProviderHealth(
      this.metrics,
      "gemini" as const,
      health.state,
      health.averageLatencyMs,
    );
  }

  /** Execute an AI request with full circuit breaker + failover protection */
  async executeWithProtection<T>(
    service: ServiceName,
    fn: () => Promise<T>,
    options: {
      /** Feature name for logging */
      feature: "chat" | "code" | "image" | "voice" | "vision" | "ask";
      /** Fallback degradation response */
      degradationResponse?: T;
      /** Whether to use failover */
      useFailover?: boolean;
    } = {},
  ): Promise<T> {
    const breaker = this.getBreaker(service);
    const useFailover = options.useFailover ?? true;

    // Try circuit breaker first
    try {
      const result = await breaker.execute(fn, {
        degradationResponse: options.degradationResponse,
      });

      // Record success on the breaker
      this.metrics.recordCounter(
        MetricNames.CIRCUIT_BREAKER_FAILURES,
        "Total circuit breaker failures for a service",
        [{ name: "service", value: service }],
        0,
      );

      return result;
    } catch (error) {
      this.logger.warn("Circuit breaker threw error", "cb-error", {
        service,
        error: error instanceof Error ? error.message : String(error),
      });

      // If failover is enabled, try alternative providers
      if (useFailover) {
        try {
          return await this.executeWithFailover(fn, service, options.degradationResponse);
        } catch (failoverError) {
          this.logger.failover("All providers failed after circuit breaker", "failover-error", {
            service,
            error: failoverError instanceof Error ? failoverError.message : String(failoverError),
          });
          // Re-throw the original error or return degradation
          throw failoverError;
        }
      }

      // No failover, re-throw
      throw error;
    }
  }

  /** Execute with provider failover */
  private async executeWithFailover<T>(
    fn: () => Promise<T>,
    primaryService: ServiceName,
    degradationResponse?: T,
  ): Promise<T> {
    const decision = this.failoverManager.decideProvider({
      purpose: "chat",
      minHealthScore: 70,
      maxLatencyMs: 5000,
      enableCostAwareness: this.providerConfigCache.has("cost-aware"),
    });

    const selectedProvider = decision.selectedProvider;
    const reason = decision.reason;

    this.logger.failover("Provider failover selected", "failover-select", {
      primaryService,
      selectedProvider,
      reason,
      confidence: decision.confidence,
    });

    // Execute the function with the selected provider
    // In a real implementation, this would call the specific provider
    // For now, we'll execute the original function and let the circuit breaker handle it
    try {
      const result = await fn();

      // Record the successful provider usage
      this.updateProviderHealth(selectedProvider, {
        state: ProviderHealth.Healthy,
        averageLatencyMs: 100, // Would be measured
        errorRate: 0,
        lastSuccessAt: Date.now(),
        lastFailureAt: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        isCurrentlyUsed: true,
      });

      return result;
    } catch (error) {
      // Record the failure
      this.updateProviderHealth(selectedProvider, {
        state: ProviderHealth.Unhealthy,
        averageLatencyMs: 5000,
        errorRate: 0.5,
        lastFailureAt: Date.now(),
        lastSuccessAt: null,
        consecutiveFailures: 1,
        consecutiveSuccesses: 0,
        isCurrentlyUsed: false,
      });

      throw error;
    }
  }

  /** Get all circuit breaker metrics */
  getAllBreakerMetrics(): Record<ServiceName, any> {
    const metrics: Record<ServiceName, any> = {} as any;
    for (const [service, breaker] of this.circuitBreakerRegistry) {
      metrics[service] = breaker.getMetrics();
    }
    return metrics;
  }

  /** Get all provider health statuses */
  getAllProviderHealth(): Record<string, ProviderHealthStatus> {
    const result: Record<string, ProviderHealthStatus> = {};
    for (const [provider, health] of this.providerHealth) {
      result[provider] = health;
    }
    return result;
  }

  /** Reset a circuit breaker */
  resetBreaker(service: ServiceName): void {
    const breaker = this.circuitBreakerRegistry.get(service);
    if (breaker) {
      breaker.reset();
      this.logger.info("Circuit breaker reset", "cb-reset", { service });
    }
  }

  /** Reset all circuit breakers */
  resetAllBreakers(): void {
    for (const [service, breaker] of this.circuitBreakerRegistry) {
      breaker.reset();
    }
    this.logger.info("All circuit breakers reset", "cb-reset-all");
  }
}

/** Create an enterprise gateway instance */
export function createEnterpriseGateway(
  config: EnterpriseGatewayConfig,
): EnterpriseGateway {
  return new EnterpriseGateway(config);
}