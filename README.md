# Deployable AI Agents

[![CI](https://github.com/cmangun/deployable-ai-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/cmangun/deployable-ai-agents/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Production-grade agentic AI framework with memory, reasoning, and governance controls. Built for enterprise deployments in regulated environments.

## Healthcare & Regulated Environments

This framework was designed for environments where **every AI decision must be auditable, policy-gated, and identity-scoped** — particularly healthcare payer systems operating under HIPAA, SOC 2, and CMS interoperability mandates.

Key design constraints:

- **PHI-aware policy rules** — the policy engine supports data classification tiers (PII, PHI, PCI) with automatic access controls per tool category
- **Identity-scoped execution** — every agent run is bound to a `userId` and `conversationId`, ensuring member data isolation across sessions
- **Immutable audit trail** — every tool invocation, policy decision, and reasoning step generates a tamper-evident audit record
- **Deterministic fallbacks** — when confidence drops below threshold, the agent refuses rather than generates, preventing hallucinated benefit explanations or clinical guidance

## Why This Architecture

| Decision | Rationale |
|----------|-----------|
| **Tool-first reasoning** | The agent selects and executes tools rather than generating free-text answers. In healthcare, retrieval correctness matters more than generative fluency. |
| **Policy enforcement at every decision point** | No tool executes without passing through the policy engine. This prevents data leakage even if the LLM attempts unauthorized actions. |
| **Memory isolation per member/session** | Conversations are scoped by `conversationId` with TTL-based expiry. No cross-member context leakage. |
| **Confidence gating** | Low-confidence steps trigger safe refusal rather than speculative output — critical for benefit explanations where inaccuracy has regulatory consequences. |

## Quick Start (60 seconds)

```bash
# Clone and install
git clone https://github.com/cmangun/deployable-ai-agents.git
cd deployable-ai-agents
npm install

# Run tests
npm test

# Build
npm run build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Framework                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Agent     │  │   Policy    │  │   Memory    │              │
│  │  Reasoning  │◄─│   Engine    │◄─│   System    │              │
│  │    Loop     │  │             │  │             │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     Tool Registry                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │ │
│  │  │ Echo     │  │Calculator│  │  JSON    │  │  Date    │    │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### Enhanced Agent with Reasoning

```typescript
import { Agent, createDefaultRegistry } from 'deployable-ai-agents';

const agent = new Agent(createDefaultRegistry(), {
  maxSteps: 10,
  confidenceThreshold: 0.7,
  enableMemory: true,
  enablePolicies: true,
});

const response = await agent.run({
  task: 'Calculate 25 * 4 and explain the result',
  userId: 'user_123',
  conversationId: 'conv_456',
});

console.log(response.result);
// Response includes:
// - success: boolean
// - result: string
// - steps: detailed reasoning steps
// - durationMs: execution time
// - conversationId: for continuity
// - auditId: for compliance
```

### Policy Engine for Governance

```typescript
import { PolicyEngine, createDenyPolicy, createRateLimitPolicy } from 'deployable-ai-agents';

const policyEngine = new PolicyEngine({
  defaultEffect: 'allow',
  enableAudit: true,
});

// Block dangerous tools
policyEngine.addRule(createDenyPolicy(
  'block-dangerous',
  'tool:dangerous*',
  'Access to dangerous tools is restricted'
));

// Rate limit API calls
policyEngine.addRule(createRateLimitPolicy(
  'api-rate-limit',
  100,        // max requests
  60000,      // per minute
  'tool:api*' // pattern
));

// Evaluate before execution
const decision = await policyEngine.evaluate({
  action: 'tool:calculator',
  context: { userId: 'user_123' },
});

if (!decision.allowed) {
  console.log(`Blocked: ${decision.reason}`);
}
```

### Tool Registry with Validation

```typescript
import { ToolRegistry, Tool } from 'deployable-ai-agents';

const registry = new ToolRegistry({
  enableTracking: true,
  validateInputs: true,
});

// Register custom tool
registry.register({
  name: 'weather',
  description: 'Get weather forecast',
  category: 'external',
  enabled: true,
  version: '1.0.0',
  parameters: {
    city: {
      name: 'city',
      type: 'string',
      description: 'City name',
      required: true,
    },
  },
  execute: async (input) => {
    const city = input.city as string;
    // Fetch weather...
    return { success: true, data: { temp: 72, condition: 'sunny' } };
  },
});

// Execute with validation
const result = await registry.execute('weather', { city: 'New York' });

// Get execution statistics
const stats = registry.getStats();
console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
```

### Conversation Memory

```typescript
import { AgentMemory } from 'deployable-ai-agents';

const memory = new AgentMemory({
  maxEntriesPerConversation: 100,
  conversationTtlMs: 24 * 60 * 60 * 1000, // 24 hours
});

// Add conversation entries
await memory.addEntry('conv_123', {
  role: 'user',
  content: 'What is machine learning?',
  timestamp: new Date().toISOString(),
});

// Search across conversations
const results = await memory.searchByKeyword('machine learning', {
  limit: 5,
});

// Get conversation summary
const summary = await memory.getSummary('conv_123');
console.log(`Topics: ${summary?.topics?.join(', ')}`);
```

## Modules

| Module | Description | Key Features |
|--------|-------------|--------------|
| **Agent** | Core reasoning loop | Plan-act-observe, confidence scoring, step tracking |
| **Policy Engine** | Governance controls | Allow/deny rules, rate limiting, conditional policies |
| **Tool Registry** | Tool management | Schema validation, execution tracking, categories |
| **Memory** | Conversation storage | Search, TTL, export/import, topic extraction |

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test agent.test.ts
```

**Test Coverage:**
- 45+ agent tests (initialization, execution, tool matching, error handling)
- 35+ policy tests (rules, evaluation, rate limiting, audit)
- 40+ registry tests (registration, execution, validation, tracking)
- 35+ memory tests (entries, search, limits, export/import)

## Project Structure

```
deployable-ai-agents/
├── src/
│   ├── agent/
│   │   └── agent.ts         # Enhanced agent with reasoning
│   ├── policy/
│   │   └── engine.ts        # Policy engine for governance
│   ├── memory/
│   │   └── memory.ts        # Conversation memory system
│   ├── tools/
│   │   └── registry.ts      # Tool registry with validation
│   └── index.ts             # Main exports
├── test/
│   ├── agent.test.ts        # Agent tests
│   ├── policy.test.ts       # Policy engine tests
│   ├── registry.test.ts     # Tool registry tests
│   └── memory.test.ts       # Memory tests
└── docs/
    └── architecture.md      # Architecture documentation
```

## Enterprise Features

### Audit Trail

Every agent execution generates an audit ID for compliance:

```typescript
const response = await agent.run({ task: '...' });
console.log(`Audit ID: ${response.auditId}`);
// audit_1704567890123_abc12345
```

### Policy-Gated Execution

Actions are validated against policy rules before execution:

```typescript
// Step includes policy decisions
response.steps.forEach(step => {
  if (step.policyDecisions) {
    step.policyDecisions.forEach(decision => {
      console.log(`${decision.policyId}: ${decision.allowed ? 'ALLOWED' : 'DENIED'}`);
    });
  }
});
```

### Confidence Tracking

Agent reasoning includes confidence scores:

```typescript
response.steps.forEach(step => {
  console.log(`Step ${step.stepNumber}:`);
  console.log(`  Reasoning: ${step.thought.reasoning}`);
  console.log(`  Confidence: ${(step.thought.confidence * 100).toFixed(0)}%`);
});
```

## Production Deployment

### Configuration

```typescript
const agent = new Agent(registry, {
  maxSteps: 10,              // Limit reasoning steps
  timeoutMs: 30000,          // 30 second timeout
  confidenceThreshold: 0.7,  // Minimum confidence
  verbose: false,            // Disable debug logging
  enableMemory: true,        // Enable conversation memory
  enablePolicies: true,      // Enable policy enforcement
});
```

### Error Handling

```typescript
const response = await agent.run({ task: '...' });

if (!response.success) {
  console.error(`Task failed: ${response.result}`);
  response.warnings?.forEach(w => console.warn(w));
}
```

## Payer Architecture Alignment

This framework maps directly to the architecture pattern used by major healthcare payers:

```
Legacy Payer Systems (eligibility, claims, benefits)
        ↓
FHIR / Integration Layer (HL7, provider connectivity)
        ↓
Data & Analytics Platform (claims + pharmacy + clinical)
        ↓
Digital Experience Microservices  ← Tool Registry lives here
        ↓
AI Orchestration Layer            ← Agent + Policy Engine lives here
        ↓
Member Applications (Web / Mobile / Chat)
```

In this model:
- **Tool Registry** exposes payer APIs (benefits lookup, eligibility check, claims status) as validated, schema-enforced tools
- **Policy Engine** enforces per-member access controls, cost budgets, and PHI handling rules before any tool executes
- **Agent Reasoning Loop** orchestrates multi-step member interactions (e.g., "Am I covered for this procedure?") by selecting and sequencing the right tools
- **Memory System** maintains conversation continuity within identity-scoped sessions
- **Audit Logger** produces the compliance trail required for CMS and HIPAA audit readiness

## Related Repositories

- [enterprise-llm-integration](https://github.com/cmangun/enterprise-llm-integration) - LLM governance library
- [regulated-data-pipelines](https://github.com/cmangun/regulated-data-pipelines) - HIPAA-compliant ETL
- [healthcare-rag-platform](https://github.com/cmangun/healthcare-rag-platform) - HIPAA-compliant RAG with PHI detection
- [agentic-member-assistant](https://github.com/cmangun/agentic-member-assistant) - Virtual health assistant with identity-scoped retrieval
- [fhir-integration-service](https://github.com/cmangun/fhir-integration-service) - FHIR R4 interoperability service

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Christopher Mangun** - Healthcare AI Consultant  
- Portfolio: [healthcare-ai-consultant.com](https://healthcare-ai-consultant.com)
- GitHub: [@cmangun](https://github.com/cmangun)
- LinkedIn: [cmangun](https://linkedin.com/in/cmangun)
