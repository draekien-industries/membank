import type { Scenario } from "../types.js";
import { generateFiller } from "./filler.js";

const D1: Scenario = {
  id: "D1",
  class: "decision",
  lengthBucket: "short",
  expectedType: "decision",
  expectedContent:
    "Storage layer is moving from SQLite to managed Postgres on RDS per infra requirement.",
  messages: [
    {
      role: "user",
      content:
        "We've been chatting about the storage layer. SQLite is fine for dev but I just got off a call with infra — they want managed Postgres on RDS. Let's switch. Update the repo plan.",
    },
    {
      role: "assistant",
      content:
        "Got it — moving the storage layer from SQLite to managed Postgres on RDS. I'll update the repo plan and adjust the migration scripts. Anything else from the infra call worth capturing?",
    },
    { role: "user", content: "That's it for now. Go ahead with the plan update." },
  ],
};

const D2: Scenario = {
  id: "D2",
  class: "decision",
  lengthBucket: "short",
  expectedType: "preference",
  expectedContent: "Use 2-space indentation throughout this repo.",
  messages: [
    {
      role: "user",
      content:
        "Heads up before you start editing — every file in this repo uses 2-space indentation. The biome config enforces it but a couple files slipped through. Match what's around you.",
    },
    { role: "assistant", content: "Understood — 2-space indentation, matching surrounding style." },
    {
      role: "user",
      content: "Cool. Now back to the actual ticket — can you fix the typo in the readme header?",
    },
  ],
};

const D3: Scenario = {
  id: "D3",
  class: "decision",
  lengthBucket: "medium",
  expectedType: "decision",
  expectedContent:
    "Password hashing uses bcrypt rather than argon2 because the deployment platform's runtime sandbox does not support argon2's native bindings.",
  messages: [
    {
      role: "user",
      content:
        "Quick context: we're migrating the auth layer. I've been going back and forth on bcrypt vs argon2. " +
        generateFiller(3001, 5500) +
        " Anyway — the platform team confirmed our serverless runtime can't load argon2's native binding. So we're going with bcrypt. cost factor 12. Update the auth design doc to match.",
    },
    {
      role: "assistant",
      content:
        "Right — bcrypt with cost 12, dropping the argon2 path because of the runtime sandbox limitation. I'll update the auth design doc next.",
    },
    { role: "user", content: "Yes, please proceed with the doc update." },
  ],
};

const D4: Scenario = {
  id: "D4",
  class: "decision",
  lengthBucket: "medium",
  expectedType: "preference",
  expectedContent:
    "Use named exports rather than default exports throughout this codebase; rename mismatched files as they're touched.",
  messages: [
    {
      role: "user",
      content:
        "Reviewing the PR you opened. Quick note on style. " +
        generateFiller(3002, 5500) +
        " One thing — we never use default exports in this codebase. Always named exports. Fix the new component to use a named export, and if you touch any file with a default export, convert it. The lint rule isn't catching it yet but it's a hard convention.",
    },
    {
      role: "assistant",
      content:
        "Acknowledged — named exports only. I'll fix the new component and convert any default-export files I touch.",
    },
    {
      role: "user",
      content: "Good. Now move on to the next review comment about the stale token check.",
    },
  ],
};

const D5: Scenario = {
  id: "D5",
  class: "decision",
  lengthBucket: "medium",
  expectedType: "fact",
  expectedContent:
    "The production database is hosted in AWS region eu-west-2 (London); cross-region calls add ~80ms latency.",
  messages: [
    {
      role: "user",
      content:
        "Working through the latency report. " +
        generateFiller(3003, 5400) +
        " Just so you know if it comes up — the production database lives in eu-west-2. London. Anything calling it from us-east-1 will eat about 80ms one-way. The edge functions in us-east-1 are why we see those slow tail latencies.",
    },
    {
      role: "assistant",
      content:
        "That explains the p99 spikes on the billing endpoint. The edge handlers in us-east-1 are doing synchronous reads against eu-west-2 for the customer lookup.",
    },
    { role: "user", content: "Right. Sketch out a fix using a regional cache?" },
  ],
};

const D6: Scenario = {
  id: "D6",
  class: "decision",
  lengthBucket: "long",
  expectedType: "decision",
  expectedContent:
    "Internal APIs will adopt tRPC instead of REST; the team is committing to migrate existing endpoints over the next two quarters.",
  messages: [
    {
      role: "user",
      content:
        "Long meeting notes incoming — bear with me. " +
        generateFiller(6001, 24000) +
        " Decision from the architecture sync: we're moving internal APIs from REST to tRPC. External APIs stay REST. Migration over the next two quarters, starting with the billing service. Update the architecture doc and the new-service template. The reasoning was end-to-end type safety and the smaller payloads we measured in the spike.",
    },
    {
      role: "assistant",
      content:
        "Understood — internal APIs to tRPC, external stays REST, migration starts with billing, two-quarter timeline. I'll update the architecture doc and the new-service template now.",
    },
    { role: "user", content: "Go ahead, then circle back so we can review the diff." },
  ],
};

const D7: Scenario = {
  id: "D7",
  class: "decision",
  lengthBucket: "long",
  expectedType: "correction",
  expectedContent: "The staging environment URL is staging-api.example.io, not staging.example.io.",
  messages: [
    {
      role: "assistant",
      content:
        "I've been hitting staging.example.io for the smoke tests. " +
        generateFiller(6002, 22000) +
        " Pulling the cert chain shows it's expired since March, which would explain the TLS handshake failures we've been chasing.",
    },
    {
      role: "user",
      content:
        "Wait — staging.example.io is decommissioned. The actual staging URL is staging-api.example.io. The DNS for the old hostname still resolves to a parked load balancer. That's why the cert is expired. Use staging-api going forward.",
    },
    { role: "assistant", content: "Understood — switching to staging-api.example.io." },
    { role: "user", content: "Yes. Re-run the smoke tests and tell me what you see." },
  ],
};

const D8: Scenario = {
  id: "D8",
  class: "decision",
  lengthBucket: "long",
  expectedType: "preference",
  expectedContent:
    "Error-level logs go to stderr only; never to stdout. Stdout is reserved for structured output consumed by tooling.",
  messages: [
    {
      role: "user",
      content:
        "Going to give you a tour of the logging conventions before you touch the migration script. " +
        generateFiller(6003, 24000) +
        " Hard rule for everything in this repo: error logs go to stderr. Always. Stdout is reserved for structured output that downstream tooling consumes — JSON, machine-readable. Mixing error chatter into stdout breaks the parsers. Even warnings go to stderr. Match what packages/cli/src/formatter.ts does.",
    },
    {
      role: "assistant",
      content:
        "Clear — error and warning logs to stderr, stdout reserved for structured machine-readable output. I'll mirror the formatter pattern in any new code.",
    },
    { role: "user", content: "Now let's look at the migration script — what's the current state?" },
  ],
};

export const DECISIONS: Scenario[] = [D1, D2, D3, D4, D5, D6, D7, D8];
