import { mkdirSync } from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";
import { modelSpec, parseSelection, supportsFast, type ModelSelection, type RoleName } from "./models.ts";

export type SettingsScope = "user" | "project";

// Use the pinned runtime's locked, atomic settings merge and project-root resolver.
type NativeSettings = Pick<typeof import("../node_modules/pi-subagents/src/agents/agents.js"), "mergeBuiltinAgentOverride" | "findConfiguredProjectRoot" | "discoverAgents">;
let nativeSettings: Promise<NativeSettings> | undefined;
function native(): Promise<NativeSettings> {
  const entry = import.meta.resolve("pi-subagents/agents");
  const ext = entry.endsWith(".ts") ? "ts" : "js";
  return nativeSettings ??= import(new URL(`../agents/agents.${ext}`, entry).href);
}

export async function saveSelection(cwd: string, name: RoleName, selection: ModelSelection, scope: SettingsScope, fast = false): Promise<string> {
  const api = await native();
  if (scope === "project" && !api.findConfiguredProjectRoot(cwd)) {
    mkdirSync(path.join(cwd, CONFIG_DIR_NAME), { recursive: true });
  }
  const root = scope === "project" ? api.findConfiguredProjectRoot(cwd) : undefined;
  if (scope === "project" && !root) throw new Error("Hybrid Subagents: project settings are not available here. No project config root was found.");
  return api.mergeBuiltinAgentOverride(cwd, name, scope, {
    model: modelSpec(selection), thinking: selection.thinking,
    fast: fast && supportsFast(selection.provider),
  });
}

/** Effective Fast choice from native agent discovery, including scoped overrides. */
export async function configuredFast(name: RoleName, ctx: SelectionContext): Promise<boolean> {
  const { agents } = (await native()).discoverAgents(ctx.cwd, ctx.isProjectTrusted() ? "both" : "user", ctx.model?.provider);
  return agents.find((agent) => agent.name === name)?.fast === true;
}

type SelectionContext = Pick<ExtensionContext, "cwd" | "modelRegistry" | "isProjectTrusted" | "model">;

/** Resolve the native settings without a per-run override; Main's provider may affect precedence. */
export async function configuredSelection(name: RoleName, ctx: SelectionContext): Promise<ModelSelection> {
  const result = await resolveSubagentLaunchContract({
    agent: name, cwd: ctx.cwd, agentScope: ctx.isProjectTrusted() ? "both" : "user",
    availableModels: ctx.modelRegistry.getAll(), parentModel: ctx.model,
  });
  if (!result.ok) throw new Error(`Hybrid Subagents: ${name}: ${result.message}`);
  const contract = result.contract;
  if (!contract.model) throw new Error(`Hybrid Subagents: ${name} requires a local native Pi model.`);
  return parseSelection(contract.model, contract.thinking);
}
