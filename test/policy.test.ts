/**
 * Policy Engine Tests
 * 
 * Comprehensive test suite for the policy engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PolicyEngine,
  PolicyRule,
  PolicyContext,
  createDenyPolicy,
  createAllowPolicy,
  createRateLimitPolicy,
  createConditionalPolicy,
  createUserPolicy,
  createTimePolicy,
} from '../src/policy/engine.js';

// ============================================================================
// POLICY ENGINE CORE TESTS
// ============================================================================

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('initialization', () => {
    it('creates engine with default config', () => {
      const engine = new PolicyEngine();
      expect(engine).toBeDefined();
    });

    it('accepts custom default effect', () => {
      const engine = new PolicyEngine({ defaultEffect: 'deny' });
      expect(engine).toBeDefined();
    });

    it('starts with no rules', () => {
      const rules = engine.getRules();
      expect(rules.length).toBe(0);
    });
  });

  describe('rule management', () => {
    it('adds rules', () => {
      engine.addRule(createAllowPolicy('allow-all', '*'));
      expect(engine.getRules().length).toBe(1);
    });

    it('removes rules', () => {
      engine.addRule(createAllowPolicy('test', '*'));
      const removed = engine.removeRule('test');
      expect(removed).toBe(true);
      expect(engine.getRules().length).toBe(0);
    });

    it('returns false when removing non-existent rule', () => {
      const removed = engine.removeRule('nonexistent');
      expect(removed).toBe(false);
    });

    it('sorts rules by priority', () => {
      engine.addRule({ ...createAllowPolicy('low', '*'), priority: 10 });
      engine.addRule({ ...createAllowPolicy('high', '*'), priority: 100 });
      engine.addRule({ ...createAllowPolicy('mid', '*'), priority: 50 });

      const rules = engine.getRules();
      expect(rules[0].id).toBe('high');
      expect(rules[1].id).toBe('mid');
      expect(rules[2].id).toBe('low');
    });

    it('enables and disables rules', () => {
      engine.addRule(createAllowPolicy('test', '*'));
      
      engine.setRuleEnabled('test', false);
      const rule = engine.getRules().find(r => r.id === 'test');
      expect(rule?.enabled).toBe(false);
      
      engine.setRuleEnabled('test', true);
      const rule2 = engine.getRules().find(r => r.id === 'test');
      expect(rule2?.enabled).toBe(true);
    });

    it('clears all rules', () => {
      engine.addRule(createAllowPolicy('a', '*'));
      engine.addRule(createAllowPolicy('b', '*'));
      engine.clearRules();
      expect(engine.getRules().length).toBe(0);
    });
  });

  describe('evaluation', () => {
    it('returns default allow when no rules match', async () => {
      const engine = new PolicyEngine({ defaultEffect: 'allow' });
      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(true);
      expect(decision.policyId).toBe('default');
    });

    it('returns default deny when no rules match', async () => {
      const engine = new PolicyEngine({ defaultEffect: 'deny' });
      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.policyId).toBe('default');
    });

    it('evaluates deny rules', async () => {
      engine.addRule(createDenyPolicy('deny-test', 'test:*', 'Test denied'));

      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.policyId).toBe('deny-test');
    });

    it('evaluates allow rules', async () => {
      const engine = new PolicyEngine({ defaultEffect: 'deny' });
      engine.addRule(createAllowPolicy('allow-test', 'test:*'));

      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(true);
      expect(decision.policyId).toBe('allow-test');
    });

    it('respects rule priority', async () => {
      engine.addRule({ ...createAllowPolicy('low-allow', 'test:*'), priority: 10 });
      engine.addRule({ ...createDenyPolicy('high-deny', 'test:*', 'High priority'), priority: 100 });

      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.policyId).toBe('high-deny');
    });

    it('skips disabled rules', async () => {
      engine.addRule(createDenyPolicy('deny-test', 'test:*', 'Denied'));
      engine.setRuleEnabled('deny-test', false);

      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.allowed).toBe(true); // Falls through to default
    });

    it('includes timestamp in decision', async () => {
      const decision = await engine.evaluate({
        action: 'test:action',
        context: {},
      });

      expect(decision.timestamp).toBeDefined();
      const timestamp = new Date(decision.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('pattern matching', () => {
    it('matches exact patterns', async () => {
      engine.addRule(createDenyPolicy('exact', 'tool:calculator', 'Exact match'));

      const match = await engine.evaluate({ action: 'tool:calculator', context: {} });
      const noMatch = await engine.evaluate({ action: 'tool:echo', context: {} });

      expect(match.allowed).toBe(false);
      expect(noMatch.allowed).toBe(true);
    });

    it('matches wildcard patterns', async () => {
      engine.addRule(createDenyPolicy('wildcard', 'tool:*', 'Wildcard match'));

      const match1 = await engine.evaluate({ action: 'tool:calculator', context: {} });
      const match2 = await engine.evaluate({ action: 'tool:echo', context: {} });
      const noMatch = await engine.evaluate({ action: 'agent:start', context: {} });

      expect(match1.allowed).toBe(false);
      expect(match2.allowed).toBe(false);
      expect(noMatch.allowed).toBe(true);
    });

    it('matches partial wildcard patterns', async () => {
      engine.addRule(createDenyPolicy('partial', 'tool:calc*', 'Partial match'));

      const match = await engine.evaluate({ action: 'tool:calculator', context: {} });
      const noMatch = await engine.evaluate({ action: 'tool:echo', context: {} });

      expect(match.allowed).toBe(false);
      expect(noMatch.allowed).toBe(true);
    });

    it('matches all with * pattern', async () => {
      engine.addRule(createDenyPolicy('all', '*', 'Match all'));

      const decision = await engine.evaluate({ action: 'anything:here', context: {} });
      expect(decision.allowed).toBe(false);
    });
  });

  describe('conditional policies', () => {
    it('evaluates condition function', async () => {
      engine.addRule(createConditionalPolicy(
        'admin-only',
        'admin:*',
        (ctx) => (ctx.context.role as string) === 'admin',
        'allow',
        'Admin access only'
      ));

      const adminDecision = await engine.evaluate({
        action: 'admin:delete',
        context: { role: 'admin' },
      });

      const userDecision = await engine.evaluate({
        action: 'admin:delete',
        context: { role: 'user' },
      });

      expect(adminDecision.allowed).toBe(true);
      expect(userDecision.allowed).toBe(true); // Falls through to default
    });
  });

  describe('rate limiting', () => {
    it('enforces rate limits', async () => {
      engine.addRule(createRateLimitPolicy('rate-limit', 2, 1000, '*'));

      // First two should pass
      const first = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      const second = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      
      // Third should be rate limited
      const third = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(false);
      expect(third.reason).toContain('Rate limit');
    });

    it('tracks rate limits per user', async () => {
      engine.addRule(createRateLimitPolicy('rate-limit', 1, 1000, '*'));

      const user1 = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      const user2 = await engine.evaluate({ action: 'test', context: { userId: 'user2' } });

      expect(user1.allowed).toBe(true);
      expect(user2.allowed).toBe(true);
    });

    it('resets rate limits', async () => {
      engine.addRule(createRateLimitPolicy('rate-limit', 1, 1000, '*'));

      await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      const blocked = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      
      expect(blocked.allowed).toBe(false);

      engine.resetRateLimits();

      const after = await engine.evaluate({ action: 'test', context: { userId: 'user1' } });
      expect(after.allowed).toBe(true);
    });
  });

  describe('user policies', () => {
    it('allows specified users', async () => {
      engine.addRule(createUserPolicy('vip', ['admin', 'manager'], 'premium:*'));

      const admin = await engine.evaluate({
        action: 'premium:feature',
        context: { userId: 'admin' },
      });

      expect(admin.allowed).toBe(true);
    });

    it('denies unspecified users through default', async () => {
      const engine = new PolicyEngine({ defaultEffect: 'deny' });
      engine.addRule(createUserPolicy('vip', ['admin'], 'premium:*'));

      const regular = await engine.evaluate({
        action: 'premium:feature',
        context: { userId: 'regular' },
      });

      expect(regular.allowed).toBe(false);
    });
  });

  describe('audit', () => {
    it('calls custom audit handler', async () => {
      const auditLog: Array<{ decision: any; context: any }> = [];
      
      const engine = new PolicyEngine({
        enableAudit: true,
        auditHandler: (decision, context) => {
          auditLog.push({ decision, context });
        },
      });

      await engine.evaluate({ action: 'test', context: {} });

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].context.action).toBe('test');
    });

    it('respects audit enabled flag', async () => {
      const auditLog: Array<{ decision: any; context: any }> = [];
      
      const engine = new PolicyEngine({
        enableAudit: false,
        auditHandler: (decision, context) => {
          auditLog.push({ decision, context });
        },
      });

      await engine.evaluate({ action: 'test', context: {} });

      expect(auditLog.length).toBe(0);
    });
  });
});

// ============================================================================
// POLICY FACTORY TESTS
// ============================================================================

describe('Policy Factories', () => {
  describe('createDenyPolicy', () => {
    it('creates deny policy with correct structure', () => {
      const policy = createDenyPolicy('test', 'action:*', 'Test reason');

      expect(policy.id).toBe('test');
      expect(policy.effect).toBe('deny');
      expect(policy.description).toBe('Test reason');
      expect(policy.enabled).toBe(true);
    });
  });

  describe('createAllowPolicy', () => {
    it('creates allow policy with correct structure', () => {
      const policy = createAllowPolicy('test', 'action:*');

      expect(policy.id).toBe('test');
      expect(policy.effect).toBe('allow');
      expect(policy.enabled).toBe(true);
    });
  });

  describe('createRateLimitPolicy', () => {
    it('creates rate limit policy with correct config', () => {
      const policy = createRateLimitPolicy('test', 100, 60000, 'api:*');

      expect(policy.id).toBe('test');
      expect(policy.rateLimit).toBeDefined();
      expect(policy.rateLimit?.maxRequests).toBe(100);
      expect(policy.rateLimit?.windowMs).toBe(60000);
    });
  });

  describe('createConditionalPolicy', () => {
    it('creates conditional policy with custom condition', () => {
      const condition = (ctx: PolicyContext) => ctx.context.valid === true;
      const policy = createConditionalPolicy('test', '*', condition, 'allow', 'Test');

      expect(policy.id).toBe('test');
      expect(policy.condition).toBe(condition);
    });
  });

  describe('createTimePolicy', () => {
    it('creates time-based policy', () => {
      const policy = createTimePolicy('test', '*', { start: 9, end: 17 });

      expect(policy.id).toBe('test');
      expect(policy.description).toContain('9:00');
      expect(policy.description).toContain('17:00');
    });
  });
});
