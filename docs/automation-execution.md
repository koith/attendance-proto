# Autonomous work execution boundary

The supervisor is an executable retry loop, not a fully autonomous code-editing agent.

Run: `node scripts/work-orchestrator.mjs init`, then `WORKER_COMMAND="node scripts/ai-worker.mjs" OPENAI_API_KEY=... node scripts/work-runner.mjs`.

The Responses API worker can analyze tasks and produce suggestions but **cannot** edit GitHub or independently verify CI without tool integrations. It deliberately does not record completion evidence. The supervisor retries up to MAX_ATTEMPTS and marks a task blocked. An external authorized coding executor and GitHub Actions verification integration are required before claiming unattended software development. Never expose OPENAI_API_KEY in logs. Do not run against production automatically.
