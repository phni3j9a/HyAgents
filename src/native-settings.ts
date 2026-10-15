import { mkdirSync } from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";
import { configuredFastFrom, saveFast, type FastContext } from "./fast-settings.ts";
import { modelSpec, parseSelection, supportsFast, type ModelSelection, type RoleName } from "./models.ts";

export type SettingsScope = "user" | "project";

// pi-subagents 0.76.1 does not export its settings editor as a public subpath.
// Keep this single, version-pinned adapter to its own locked, atomic field merge
// and project-root resolver; do not duplicate the native settings precedence.
type NativeSettings = Pick<typeof import("../node_modules/pi-subagents/src/agents/agents.js"), "mergeBuiltinAgentOverride" | "findConfiguredProjectRoot">;
let nativeSettings: Promise<NativeSettings> | undefined;
function native(): Promise<NativeSettings> {
  const entry = import.meta.resolve("pi-subagents/agents");
  return nativeSettings ??= import(new URL(`../agents/agents.${entry.endsWith(".ts") ? "ts" : "js"}`, entry).href);
}

/** Native project-root resolution, shared with the HyAgents Fast settings file. */
export async function configuredProjectRoot(cwd: string): Promise<string | undefined> {
  return (await native()).findConfiguredProjectRoot(cwd) ?? undefined;
}

export async function saveSelection(cwd: string, name: RoleName, selection: ModelSelection, scope: SettingsScope, fast = false): Promise<string> {
  const api = await native();
  if (scope === "project" && !api.findConfiguredProjectRoot(cwd)) {
    mkdirSync(path.join(cwd, CONFIG_DIR_NAME), { recursive: true });
  }
  const file = api.mergeBuiltinAgentOverride(cwd, name, scope, { model: modelSpec(selection), thinking: selection.thinking });
  // Save Fast after the native write succeeds, next to the same settings file.
  saveFast(path.dirname(file), name, fast && supportsFast(selection.provider));
  return file;
}

/** Effective Fast choice for a role (project file wins when the project is trusted). */
export async function configuredFast(name: RoleName, ctx: FastContext): Promise<boolean> {
  return configuredFastFrom(ctx.isProjectTrusted() ? await configuredProjectRoot(ctx.cwd) : undefined, name);
}

type SelectionContext = Pick<ExtensionContext, "cwd" | "modelRegistry" | "isProjectTrusted">;

/** Resolve the operator's definition/settings, deliberately without a per-run override. */
export async function configuredSelection(name: RoleName, ctx: SelectionContext): Promise<ModelSelection> {
  const result = await resolveSubagentLaunchContract({
    agent: name, cwd: ctx.cwd, agentScope: ctx.isProjectTrusted() ? "both" : "user",
    availableModels: ctx.modelRegistry.getAll(),
  });
  if (!result.ok) throw new Error(`HyAgents: ${name}: ${result.message}`);
  if (!result.contract.model) throw new Error(`HyAgents: ${name} requires a local native Pi model.`);
  return parseSelection(result.contract.model, result.contract.thinking);
}

/** Provider-conditioned selections cannot be reconstructed in an isolated child. */
export async function checkProviderSelection(name: RoleName, ctx: ExtensionContext, selected: ModelSelection): Promise<void> {
  if (!ctx.model) return;
  const result = await resolveSubagentLaunchContract({
    agent: name, cwd: ctx.cwd, agentScope: ctx.isProjectTrusted() ? "both" : "user",
    availableModels: ctx.modelRegistry.getAll(), preferredProvider: ctx.model.provider,
  });
  if (!result.ok) throw new Error(`HyAgents: ${name}: ${result.message}`);
  if (result.contract.model && modelSpec(parseSelection(result.contract.model, result.contract.thinking)) !== modelSpec(selected)) {
    throw new Error(`HyAgents: ${name} has a conflicting agentOverridesByProvider selection. Use an ordinary agentOverrides selection for HyAgents.`);
  }
}
