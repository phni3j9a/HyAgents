import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { activeAgent, describeSelection, ROLE_NAMES } from "../src/models.ts";
import { configuredFast, configuredSelection } from "../src/native-settings.ts";
import { modelCommand, modelCompletions } from "../src/model-command.ts";

const policy = readFileSync(new URL("../skills/hyagents/SKILL.md", import.meta.url), "utf8")
  .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();

export default function hyagents(pi: ExtensionAPI): void {
  // Background children discover ambient extensions. They must not become another Main.
  if (process.env.PI_SUBAGENT_CHILD === "1") return;
  async function diagnostics(ctx: ExtensionContext): Promise<{ mapping: string[]; issues: string[] }> {
    const lines: string[] = [];
    const mapping: string[] = [];
    if (!pi.getAllTools().some((tool) => tool.name === "subagent")) {
      lines.push("pi-subagents is not loaded. Run: pi install npm:pi-subagents@0.76.1, then /reload.");
    }
    const available = ctx.modelRegistry.getAvailable();
    for (const name of ROLE_NAMES) {
      try {
        const role = await configuredSelection(name, ctx);
        const fast = await configuredFast(name, ctx);
        mapping.push(`${name}: ${describeSelection(role, fast)}`);
        const model = ctx.modelRegistry.find(role.provider, role.id);
        if (!model) lines.push(`${name}: missing ${role.provider}/${role.id}; update Pi/provider model configuration.`);
        else if (!getSupportedThinkingLevels(model).includes(role.thinking)) lines.push(`${name}: ${role.thinking} is unsupported; choose a supported value with /hyagents models.`);
        else if (!available.some((item) => item.provider === role.provider && item.id === role.id)) lines.push(`${name}: authenticate ${role.provider} in Pi before use.`);
      } catch (error) { lines.push(error instanceof Error ? error.message : String(error)); }
    }
    return { mapping, issues: lines };
  }

  pi.on("session_start", async (_event, ctx) => {
    if (activeAgent(ctx.getSystemPrompt())) return;
    const { issues } = await diagnostics(ctx);
    if (issues.length) ctx.ui.notify(issues.join("\n"), "warning");
  });

  pi.on("before_agent_start", (event) => {
    if (activeAgent(event.systemPrompt) || !event.systemPromptOptions.selectedTools.some((name) => name === "subagent" || name === "subagents_enable")) return;
    // Keep Pi's structured prompt and other extensions' sections (and prompt caching).
    event.systemPromptOptions.sections.hyagents = policy;
  });

  pi.registerCommand("hyagents", {
    description: "Show Hybrid Subagents readiness, or choose role models with /hyagents models",
    getArgumentCompletions: modelCompletions,
    handler: async (args, ctx) => {
      try {
        const trimmed = args.trim();
        if (trimmed === "models" || trimmed.startsWith("models ")) {
          await modelCommand(trimmed.slice(6), ctx);
          return;
        }
        if (trimmed) { ctx.ui.notify("Usage: /hyagents [models [worker|scout|reviewer|designer|reset]]", "error"); return; }
        const { mapping, issues } = await diagnostics(ctx);
        ctx.ui.notify([...mapping, "", ...(issues.length ? issues : ["Model registry and authentication configuration ready. Live provider access is checked when each child runs."])].join("\n"), issues.length ? "warning" : "info");
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
    },
  });
}
