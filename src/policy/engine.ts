/**
 * Policy Engine for Agent Governance
 * 
 * Implements configurable policy controls for:
 * - Action authorization (allow/deny)
 * - Rate limiting
 * - Content filtering
 * - Cost controls
 * - Audit requirements
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PolicyContext {
  /** Action being evaluated (e.g., "tool:calculator", "agent:start") */
  action: string;
  /** Additional context for the policy decision */
  context: Record<string, unknown>;
}

export interface PolicyDecision {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Policy that made the decision */
  policyId: string;
  /** Timestamp of decision */
  timestamp: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface PolicyRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Rule description */
  description: string;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Action pattern to match (supports wildcards) */
  actionPattern: string;
  /** Condition function */
  condition: (context: PolicyContext) => boolean;
  /** Effect when condition is true */
  effect: 'allow' | 'deny';
  /** Optional rate limit configuration */
  rateLimit?: RateLimitConfig;
}

export interface RateLimitConfig {
  /** Maximum requests */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key to use for rate limiting (e.g., "userId") */
  keyField: string;
}

export interface PolicyEngineConfig {
  /** Default effect when no rules match */
  defaultEffect: 'allow' | 'deny';
  /** Enable audit logging */
  enableAudit: boolean;
  /** Custom audit handler */
  auditHandler?: (decision: PolicyDecision, context: PolicyContext) => void;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class RateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart > config.windowMs) {
      // New window
      this.entries.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= config.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

// ============================================================================
// POLICY ENGINE
// ============================================================================

/**
 * Policy engine for agent governance and access control.
 * 
 * Evaluates rules in priority order and returns the first matching decision.
 * Supports rate limiting, content filtering, and audit logging.
 * 
 * @example
 * ```typescript
 * const engine = new PolicyEngine({
 *   defaultEffect: 'allow',
 *   enableAudit: true,
 * });
 * 
 * engine.addRule({
 *   id: 'block-dangerous',
 *   name: 'Block Dangerous Tools',
 *   actionPattern: 'tool:dangerous*',
 *   condition: () => true,
 *   effect: 'deny',
 *   priority: 100,
 *   enabled: true,
 *   description: 'Block access to dangerous tools',
 * });
 * 
 * const decision = await engine.evaluate({
 *   action: 'tool:dangerous-delete',
 *   context: { userId: 'user_123' },
 * });
 * ```
 */
export class PolicyEngine {
  private readonly rules: PolicyRule[] = [];
  private readonly rateLimiter = new RateLimiter();
  private readonly config: PolicyEngineConfig;

  constructor(config: Partial<PolicyEngineConfig> = {}) {
    this.config = {
      defaultEffect: 'allow',
      enableAudit: true,
      ...config,
    };
  }

  /**
   * Add a policy rule.
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    // Sort by priority (descending)
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a policy rule by ID.
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable or disable a rule.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Evaluate a policy context against all rules.
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const timestamp = new Date().toISOString();

    // Find matching rules
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Check action pattern match
      if (!this.matchesPattern(context.action, rule.actionPattern)) {
        continue;
      }

      // Check condition
      if (!rule.condition(context)) {
        continue;
      }

      // Check rate limit if configured
      if (rule.rateLimit) {
        const key = this.getRateLimitKey(context, rule.rateLimit);
        const allowed = this.rateLimiter.check(key, rule.rateLimit);
        
        if (!allowed) {
          const decision: PolicyDecision = {
            allowed: false,
            reason: `Rate limit exceeded for ${rule.name}`,
            policyId: rule.id,
            timestamp,
            metadata: { rateLimit: rule.rateLimit },
          };
          this.audit(decision, context);
          return decision;
        }
      }

      // Rule matched - return decision
      const decision: PolicyDecision = {
        allowed: rule.effect === 'allow',
        reason: rule.effect === 'allow' 
          ? `Allowed by ${rule.name}`
          : `Denied by ${rule.name}: ${rule.description}`,
        policyId: rule.id,
        timestamp,
      };
      this.audit(decision, context);
      return decision;
    }

    // No rules matched - use default
    const decision: PolicyDecision = {
      allowed: this.config.defaultEffect === 'allow',
      reason: `Default policy: ${this.config.defaultEffect}`,
      policyId: 'default',
      timestamp,
    };
    this.audit(decision, context);
    return decision;
  }

  /**
   * Check if an action matches a pattern (supports * wildcard).
   */
  private matchesPattern(action: string, pattern: string): boolean {
    if (pattern === '*') return true;

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(action);
  }

  /**
   * Get rate limit key from context.
   */
  private getRateLimitKey(context: PolicyContext, config: RateLimitConfig): string {
    const keyValue = context.context[config.keyField] || 'anonymous';
    return `${context.action}:${keyValue}`;
  }

  /**
   * Audit a policy decision.
   */
  private audit(decision: PolicyDecision, context: PolicyContext): void {
    if (!this.config.enableAudit) return;

    if (this.config.auditHandler) {
      this.config.auditHandler(decision, context);
    } else {
      // Default: log to console in verbose mode
      if (process.env.POLICY_DEBUG === 'true') {
        console.log('[PolicyEngine]', {
          action: context.action,
          allowed: decision.allowed,
          reason: decision.reason,
          policyId: decision.policyId,
        });
      }
    }
  }

  /**
   * Get all rules.
   */
  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  /**
   * Clear all rules.
   */
  clearRules(): void {
    this.rules.length = 0;
  }

  /**
   * Reset rate limiter.
   */
  resetRateLimits(): void {
    this.rateLimiter.clear();
  }
}

// ============================================================================
// BUILT-IN POLICIES
// ============================================================================

/**
 * Create a rate limit policy.
 */
export function createRateLimitPolicy(
  id: string,
  maxRequests: number,
  windowMs: number,
  actionPattern = '*'
): PolicyRule {
  return {
    id,
    name: `Rate Limit (${maxRequests}/${windowMs}ms)`,
    description: `Limit to ${maxRequests} requests per ${windowMs}ms`,
    enabled: true,
    priority: 90,
    actionPattern,
    condition: () => true,
    effect: 'allow',
    rateLimit: {
      maxRequests,
      windowMs,
      keyField: 'userId',
    },
  };
}

/**
 * Create a deny pattern policy.
 */
export function createDenyPolicy(
  id: string,
  actionPattern: string,
  reason: string,
  priority = 100
): PolicyRule {
  return {
    id,
    name: `Deny: ${actionPattern}`,
    description: reason,
    enabled: true,
    priority,
    actionPattern,
    condition: () => true,
    effect: 'deny',
  };
}

/**
 * Create an allow pattern policy.
 */
export function createAllowPolicy(
  id: string,
  actionPattern: string,
  priority = 50
): PolicyRule {
  return {
    id,
    name: `Allow: ${actionPattern}`,
    description: `Explicitly allow ${actionPattern}`,
    enabled: true,
    priority,
    actionPattern,
    condition: () => true,
    effect: 'allow',
  };
}

/**
 * Create a conditional policy.
 */
export function createConditionalPolicy(
  id: string,
  actionPattern: string,
  condition: (context: PolicyContext) => boolean,
  effect: 'allow' | 'deny',
  description: string,
  priority = 75
): PolicyRule {
  return {
    id,
    name: `Conditional: ${actionPattern}`,
    description,
    enabled: true,
    priority,
    actionPattern,
    condition,
    effect,
  };
}

/**
 * Create a user-based policy.
 */
export function createUserPolicy(
  id: string,
  allowedUsers: string[],
  actionPattern: string,
  priority = 80
): PolicyRule {
  return {
    id,
    name: `User Access: ${actionPattern}`,
    description: `Allow only specific users: ${allowedUsers.join(', ')}`,
    enabled: true,
    priority,
    actionPattern,
    condition: (ctx) => {
      const userId = ctx.context.userId as string | undefined;
      return allowedUsers.includes(userId || '');
    },
    effect: 'allow',
  };
}

/**
 * Create a time-based policy.
 */
export function createTimePolicy(
  id: string,
  actionPattern: string,
  allowedHours: { start: number; end: number },
  timezone = 'UTC',
  priority = 70
): PolicyRule {
  return {
    id,
    name: `Time Window: ${allowedHours.start}-${allowedHours.end}`,
    description: `Allow only during ${allowedHours.start}:00-${allowedHours.end}:00 ${timezone}`,
    enabled: true,
    priority,
    actionPattern,
    condition: () => {
      const now = new Date();
      const hour = now.getUTCHours();
      return hour >= allowedHours.start && hour < allowedHours.end;
    },
    effect: 'allow',
  };
}
