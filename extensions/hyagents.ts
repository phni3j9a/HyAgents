import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { registerRequiredChildExtensions, type RequiredChildExtensionRegistration } from "pi-subagents/required-child-extensions";
import { activeAgent, modelSpec, ROLES, type RoleName } from "../src/models.ts";

const policy = readFileSync(new URL("../skills/hyagents/SKILL.md", import.meta.url), "utf8")
  .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
const childGuardPath = fileURLToPath(new URL("./verify-child.ts", import.meta.url));

export default function hyagents(pi: ExtensionAPI): void {
  // Background children discover ambient extensions. They must not become another Main.
  if (process.env.PI_SUBAGENT_CHILD === "1") return;
  let registration: RequiredChildExtensionRegistration | undefined;
  let registrationError: string | undefined;

  function dispose(): void {
    registration?.dispose();
    registration = undefined;
  }

  function diagnostics(ctx: ExtensionContext): string[] {
    const lines: string[] = [];
    if (!pi.getAllTools().some((tool) => tool.name === "subagent")) {
      lines.push("pi-subagents is not loaded. Run: pi install npm:pi-subagents@0.76.1, then /reload.");
    }
    if (registrationError) lines.push(registrationError);
    const available = ctx.modelRegistry.getAvailable();
    for (const [name, role] of Object.entries(ROLES)) {
      const model = ctx.modelRegistry.find(role.provider, role.id);
      if (!model) lines.push(`${name}: missing ${role.provider}/${role.id}; update Pi/provider model configuration.`);
      else if (!getSupportedThinkingLevels(model).includes(role.thinking)) lines.push(`${name}: ${role.thinking} is unsupported; update Pi/provider configuration.`);
      else if (!available.some((item) => item.provider === role.provider && item.id === role.id)) lines.push(`${name}: authenticate ${role.provider} in Pi before use.`);
    }
    return lines;
  }

  pi.on("session_start", (_event, ctx) => {
    dispose();
    registrationError = undefined;
    if (activeAgent(ctx.getSystemPrompt())) return;
    try {
      registration = registerRequiredChildExtensions({
        sessionId: ctx.sessionManager.getSessionId(),
        extensions: [{ id: "hyagents.models", path: childGuardPath }],
      });
    } catch (error) {
      registrationError = `HyAgents model verification unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    const issues = diagnostics(ctx);
    if (issues.length) ctx.ui.notify(issues.join("\n"), "warning");
  });
  pi.on("session_shutdown", dispose);

  pi.on("before_agent_start", (event) => {
    if (activeAgent(event.systemPrompt) || !event.systemPromptOptions.selectedTools.some((name) => name === "subagent" || name === "subagents_enable")) return;
    // Keep Pi's structured prompt and other extensions' sections (and prompt caching).
    event.systemPromptOptions.sections.hyagents = registration
      ? policy
      : "HyAgents is unavailable because child model verification could not be registered. Report the startup error; do not launch HyAgents agents until it is resolved.";
  });

  pi.on("tool_call", (event) => {
    if (event.toolName !== "subagent") return;
    const name = event.input.agent;
    if (typeof name !== "string" || !Object.hasOwn(ROLES, name)) return;
    if (!registration && !event.input.action) return { block: true, reason: registrationError ?? "HyAgents model verification is not active; reload Pi." };
    // Native startup validation also covers workflows, /run, settings overrides and resume.
    // Do not intercept management calls or change the native tool arguments.
  });

  pi.registerCommand("hyagents", {
    description: "Show HyAgents model readiness (automatic delegation needs no command)",
    handler: async (_args, ctx) => {
      const mapping = (Object.keys(ROLES) as RoleName[]).map((name) => `${name}: ${modelSpec(name)}`);
      const issues = diagnostics(ctx);
      ctx.ui.notify([...mapping, "", ...(issues.length ? issues : ["Model registry and authentication configuration ready. Live provider access is checked when each child runs."])].join("\n"), issues.length ? "warning" : "info");
    },
  });
}
