import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { assertSelection, isRole, modelSpec, ROLES, ROLE_NAMES, type ModelSelection, type RoleName } from "./models.ts";
import { checkProviderSelection, configuredSelection, saveSelection, type SettingsScope } from "./native-settings.ts";

const USAGE = "/hyagents models [worker|scout|reviewer|designer|reset]";

async function chooseScope(ctx: ExtensionCommandContext): Promise<SettingsScope | undefined> {
  const choices = ["User — all projects", ...(ctx.isProjectTrusted() ? ["Project — this project only"] : [])];
  const choice = await ctx.ui.select("Save model settings", choices);
  return choice === choices[0] ? "user" : choice === choices[1] && choices.length > 1 ? "project" : undefined;
}

async function reportSaved(name: RoleName, wanted: ModelSelection, file: string, ctx: ExtensionCommandContext): Promise<void> {
  // Display the effective selection as well as the saved one. A project override
  // can legitimately shadow a user setting; never claim that it took effect.
  try {
    const actual = await configuredSelection(name, ctx);
    await checkProviderSelection(name, ctx, actual);
    const shadowed = modelSpec(actual) !== modelSpec(wanted);
    ctx.ui.notify(`${name}: saved ${modelSpec(wanted)}\n${file}\n${shadowed
      ? `Current project uses ${modelSpec(actual)}. Change the project setting to override it.`
      : "Applies to new children. Existing and retained children keep their original selection."}`, shadowed ? "warning" : "info");
  } catch (error) {
    ctx.ui.notify(`${name}: saved ${modelSpec(wanted)}\n${file}\nNot ready: ${error instanceof Error ? error.message : String(error)}`, "warning");
  }
}

export async function modelCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("Model selection requires an interactive or dialog-capable RPC client. Configure subagents.agentOverrides in Pi settings for headless use.", "warning");
    return;
  }
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) { ctx.ui.notify(`Usage: ${USAGE}`, "error"); return; }
  const target = parts[0];
  if (target === "reset") {
    const scope = await chooseScope(ctx);
    if (!scope) return;
    if (!await ctx.ui.confirm("Restore HyAgents defaults?", `${ROLE_NAMES.map((name) => `${name}: ${modelSpec(name)}`).join("\n")}\n\nSave to ${scope} settings. Other agent settings are preserved.`)) return;
    for (const name of ROLE_NAMES) {
      const file = await saveSelection(ctx.cwd, name, ROLES[name], scope);
      await reportSaved(name, ROLES[name], file, ctx);
    }
    return;
  }
  let name = target?.startsWith("hyagents.") ? target : target ? `hyagents.${target}` : undefined;
  if (name && !isRole(name)) { ctx.ui.notify(`Unknown role. Usage: ${USAGE}`, "error"); return; }
  if (!name) {
    const labels = await Promise.all(ROLE_NAMES.map(async (role) => {
      try { return `${role.slice(9)} — ${modelSpec(await configuredSelection(role, ctx))}`; }
      catch { return `${role.slice(9)} — configuration needs attention`; }
    }));
    const chosen = await ctx.ui.select("HyAgents models", labels);
    if (!chosen) return;
    name = ROLE_NAMES[labels.indexOf(chosen)];
  }
  if (!name || !isRole(name)) return;
  const models = ctx.modelRegistry.getAvailable();
  if (models.length === 0) { ctx.ui.notify("No configured models. Authenticate a provider in Pi first, then reopen /hyagents models.", "warning"); return; }
  const provider = await ctx.ui.select(`${name} — provider`, [...new Set(models.map((model) => model.provider))].sort());
  if (!provider) return;
  const candidates = models.filter((model) => model.provider === provider).sort((a, b) => a.id.localeCompare(b.id));
  const id = await ctx.ui.select(`${name} — ${provider}`, candidates.map((model) => model.id));
  const model = candidates.find((item) => item.id === id);
  if (!model) return;
  const levels = getSupportedThinkingLevels(model);
  const thinking = await ctx.ui.select(`${name} — thinking`, levels);
  if (!thinking || !levels.includes(thinking as typeof levels[number])) return;
  const selection: ModelSelection = { provider: model.provider, id: model.id, thinking: thinking as typeof levels[number] };
  assertSelection(name, model, thinking, selection);
  const scope = await chooseScope(ctx);
  if (!scope) return;
  const file = await saveSelection(ctx.cwd, name, selection, scope);
  await reportSaved(name, selection, file, ctx);
}

export function modelCompletions(prefix: string): { value: string; label: string }[] | null {
  const values = ["models", ...["worker", "scout", "reviewer", "designer", "reset"].map((name) => `models ${name}`)]
    .filter((value) => value.startsWith(prefix));
  return values.length ? values.map((value) => ({ value, label: value })) : null;
}
