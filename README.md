# Deployable AI Agents

[![CI](https://github.com/cmangun/deployable-ai-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/cmangun/deployable-ai-agents/actions/workflows/ci.yml)

Deployable agent scaffolds with tool calling, policy controls, and observability.

## Overview

Production-ready patterns for building and deploying AI agents:

- **Tool Registry**: Pluggable tool system
- **Agent Loop**: Plan-act-observe pattern
- **Policy Controls**: Limits, validation, sandboxing
- **Observability**: Structured logging, metrics hooks

## Quickstart

```bash
# Install
npm install

# Run tests
npm test

# Start dev server
npm run dev

# Build
npm run build

# Start production
npm start
```

## API Endpoints

| Endpoint      | Method | Description           |
| ------------- | ------ | --------------------- |
| `/health`     | GET    | Health check          |
| `/tools`      | GET    | List available tools  |
| `/tool/:name` | POST   | Execute a single tool |
| `/agent/run`  | POST   | Run agent with a task |

## Usage Examples

### Health Check

```bash
curl http://localhost:3000/health
```

### List Tools

```bash
curl http://localhost:3000/tools
```

### Execute Tool

```bash
curl -X POST http://localhost:3000/tool/calculator \
  -H "Content-Type: application/json" \
  -d '{"tool": "calculator", "input": {"operation": "add", "a": 5, "b": 3}}'
```

### Run Agent

```bash
curl -X POST http://localhost:3000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "Use echo to repeat hello world"}'
```

## Creating Tools

```typescript
import { Tool } from './tools/registry.js';

export const myTool: Tool = {
  name: 'my-tool',
  description: 'Description of what the tool does',
  parameters: {
    input: {
      type: 'string',
      description: 'Input parameter',
      required: true,
    },
  },
  execute: async (input) => {
    // Tool logic here
    return { result: input.input };
  },
};

// Register in server.ts
registry.register(myTool);
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Service                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Fastify   │───▶│    Agent    │───▶│   Tools     │  │
│  │   Server    │    │    Loop     │    │  Registry   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                                      │         │
│         ▼                                      ▼         │
│  ┌─────────────────────────────────────────────────────┐│
│  │                    Tool Execution                    ││
│  │  ┌────────┐  ┌────────────┐  ┌────────────────┐     ││
│  │  │  Echo  │  │ Calculator │  │  Custom Tools  │     ││
│  │  └────────┘  └────────────┘  └────────────────┘     ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Configuration

Environment variables:

| Variable           | Default     | Description               |
| ------------------ | ----------- | ------------------------- |
| `PORT`             | 3000        | Server port               |
| `NODE_ENV`         | development | Environment               |
| `MAX_AGENT_STEPS`  | 10          | Max agent loop iterations |
| `AGENT_TIMEOUT_MS` | 30000       | Agent execution timeout   |
| `LOG_LEVEL`        | info        | Logging level             |

## Next Iterations

- [ ] Add LLM integration for planning
- [ ] Add memory/context persistence
- [ ] Add MCP server support
- [ ] Add rate limiting and quotas
- [ ] Add telemetry (OpenTelemetry)
- [ ] Add human-in-the-loop approval

## License

MIT © Christopher Mangun

---

**Portfolio**: [field-deployed-engineer.vercel.app](https://field-deployed-engineer.vercel.app/)  
**Contact**: Christopher Mangun — Brooklyn, NY
