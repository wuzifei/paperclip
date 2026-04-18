import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Layered Memory System
//
// Reads markdown-based memory files from the filesystem and assembles
// a multi-layer context string that is injected into Agent prompts at
// runtime. Layers are:
//
//   L1  Project-global   .paperclip/memory/project_global.md
//   L2  Agent-specific   .paperclip/memory/agents/<nameKey>/rules.md
//   L3  Ticket-specific  .paperclip/memory/tickets/<issueId>.md  (optional)
//
// All layers are optional — missing files are silently skipped.
// ---------------------------------------------------------------------------

const MEMORY_ROOT_ENV = "PAPERCLIP_MEMORY_DIR";

function resolveMemoryRoot(): string {
  if (process.env[MEMORY_ROOT_ENV]) {
    return process.env[MEMORY_ROOT_ENV];
  }

  // Default: .paperclip/memory/ relative to cwd (repo root in dev)
  return path.resolve(process.cwd(), ".paperclip", "memory");
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export interface MemoryContext {
  /** The full assembled memory text to prepend to the agent prompt. */
  text: string;
  /** Which layers were successfully loaded. */
  layers: string[];
}

/**
 * Assemble layered memory context for an agent execution run.
 *
 * @param agentNameKey  The agent's unique name key (used to locate L2 rules).
 * @param issueId       Optional issue ID (used to locate L3 ticket context).
 * @param memoryRoot    Override the memory directory root (mainly for tests).
 */
export async function assembleMemoryContext(
  agentNameKey: string | null,
  issueId: string | null,
  memoryRoot?: string,
): Promise<MemoryContext> {
  const root = memoryRoot ?? resolveMemoryRoot();
  const layers: string[] = [];
  const parts: string[] = [];

  // --- L1: Project-global memory ---
  const globalPath = path.join(root, "project_global.md");
  const globalContent = await readFileSafe(globalPath);
  if (globalContent) {
    parts.push(
      "=== [Project Rules — All agents MUST follow] ===\n" +
      globalContent.trim() +
      "\n=== [End Project Rules] ===",
    );
    layers.push("L1:project_global");
    logger.debug({ path: globalPath }, "Loaded L1 project memory");
  }

  // --- L2: Agent-specific memory ---
  if (agentNameKey) {
    // Try multiple file names: rules.md, identity.md, specs.md
    const agentDir = path.join(root, "agents", agentNameKey);
    const candidateFiles = ["rules.md", "identity.md", "specs.md"];
    for (const fileName of candidateFiles) {
      const filePath = path.join(agentDir, fileName);
      const content = await readFileSafe(filePath);
      if (content) {
        parts.push(
          `=== [Agent Rules: ${agentNameKey}/${fileName} — You MUST follow] ===\n` +
          content.trim() +
          "\n=== [End Agent Rules] ===",
        );
        layers.push(`L2:${agentNameKey}/${fileName}`);
        logger.debug({ path: filePath }, "Loaded L2 agent memory");
      }
    }
  }

  // --- L3: Ticket-specific memory ---
  if (issueId) {
    const ticketPath = path.join(root, "tickets", `${issueId}.md`);
    const ticketContent = await readFileSafe(ticketPath);
    if (ticketContent) {
      parts.push(
        "=== [Ticket-Specific Context] ===\n" +
        ticketContent.trim() +
        "\n=== [End Ticket Context] ===",
      );
      layers.push(`L3:ticket/${issueId}`);
      logger.debug({ path: ticketPath }, "Loaded L3 ticket memory");
    }
  }

  return {
    text: parts.length > 0 ? parts.join("\n\n") : "",
    layers,
  };
}
