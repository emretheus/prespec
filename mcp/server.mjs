#!/usr/bin/env node
/**
 * edgewit MCP server — stdio transport, JSON-RPC 2.0.
 *
 * Exposes probe_limits: the tool an agent calls BEFORE writing code, to find
 * out where the thing it is about to build tends to break.
 *
 * The bank is read once at startup. It is a git-versioned corpus, not live
 * data, so re-reading per request would buy nothing.
 */
import { createInterface } from "node:readline";
import { loadBanks } from "../scripts/lib/load.mjs";
import { probe } from "./retrieval.mjs";

const PROTOCOL_VERSION = "2024-11-05";

const { banks, parseErrors } = await loadBanks();
for (const { file, message } of parseErrors) {
  process.stderr.write(`edgewit: skipping ${file}: ${message}\n`);
}
const caseCount = banks.reduce((n, b) => n + (b.doc.cases?.length ?? 0), 0);
process.stderr.write(
  `edgewit: loaded ${banks.length} bank file(s), ${caseCount} case(s)\n`,
);

const TOOLS = [
  {
    name: "define_behavior",
    description:
      "Produce the behaviour specification for a feature BEFORE writing code: " +
      "what it must do, the contract it must honour, the boundaries it must hold " +
      "at, the conditions it must survive, and the guarantees it must not break. " +
      "Returns curated cases from the edgewit bank as a sectioned spec, the open " +
      "questions to put to the user, and the defaults assumed on their behalf. " +
      "Call this at the start of any feature touching a covered domain — the " +
      "spec becomes the acceptance criteria the tests and the code are written " +
      "against.",
    inputSchema: {
      type: "object",
      required: ["feature_description"],
      properties: {
        feature_description: {
          type: "string",
          description:
            "What is being built, in the words a developer would use. " +
            'E.g. "users can browse their order history".',
        },
        side: {
          enum: ["backend", "frontend", "both"],
          default: "both",
          description: "Which side of the stack this feature lives on.",
        },
        domains: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional explicit bank domains, e.g. backend/rest-api/pagination. " +
            "Honoured even when the wording does not match them.",
        },
        depth: {
          enum: ["quick", "standard", "deep"],
          default: "standard",
          description:
            "How much of the spec to return beyond the defining behaviour, " +
            "roughly 5, 12, or 25 cases. Happy-path and contract cases are " +
            "always included in full. Use deep before high-risk work.",
        },
      },
    },
  },
];

/** JSON-RPC error codes used here. */
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

function handle(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "edgewit", version: "0.1.0" },
      };

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const { name, arguments: args = {} } = params ?? {};
      if (name !== "define_behavior") {
        throw Object.assign(new Error(`Unknown tool: ${name}`), {
          code: INVALID_PARAMS,
        });
      }
      if (!args.feature_description?.trim()) {
        throw Object.assign(new Error("feature_description is required"), {
          code: INVALID_PARAMS,
        });
      }

      const result = probe(banks, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw Object.assign(new Error(`Unknown method: ${method}`), {
        code: METHOD_NOT_FOUND,
      });
  }
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;

  let req;
  try {
    req = JSON.parse(text);
  } catch {
    return; // Not addressable: no id to reply to.
  }

  // Notifications carry no id and must not be answered.
  const isNotification = req.id === undefined || req.id === null;

  try {
    const result = handle(req.method, req.params);
    if (!isNotification) send({ jsonrpc: "2.0", id: req.id, result });
  } catch (err) {
    if (isNotification) return;
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: err.code ?? -32603, message: err.message },
    });
  }
});

rl.on("close", () => process.exit(0));
