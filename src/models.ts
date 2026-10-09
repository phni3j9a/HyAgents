import { getSupportedThinkingLevels, type Api, type Model } from "@earendil-works/pi-ai";

export const ROLES = {
  "hyagents.worker": { provider: "openai-codex", id: "gpt-6-luna", thinking: "max" },
  "hyagents.scout": { provider: "openai-codex", id: "gpt-6-luna", thinking: "xhigh" },
  "hyagents.reviewer": { provider: "openai-codex", id: "gpt-6.1-sol", thinking: "high" },
  "hyagents.designer": { provider: "anthropic", id: "claude-opus-5-5", thinking: "high" },
} as const;

export type RoleName = keyof typeof ROLES;

export function isRole(name: string): name is RoleName {
  return Object.hasOwn(ROLES, name);
}

export function modelSpec(name: RoleName): string {
  const role = ROLES[name];
  return `${role.provider}/${role.id}:${role.thinking}`;
}

/** pi-subagents adds this launch-owned tag to each native child's system prompt. */
export function activeAgent(prompt: string): string | undefined {
  return /(?:^|\n)<active_agent name="([^"]+)"\/>/.exec(prompt)?.[1];
}

export function assertSelection(name: RoleName, model: Model<Api> | undefined, thinking: string): void {
  const required = ROLES[name];
  const actual = model ? `${model.provider}/${model.id}:${thinking}` : "no model";
  if (!model || model.provider !== required.provider || model.id !== required.id || thinking !== required.thinking) {
    throw new Error(`HyAgents: ${name} requires ${modelSpec(name)}; resolved ${actual}. Restore the native agent/model settings; no automatic fallback is allowed.`);
  }
  if (!getSupportedThinkingLevels(model).includes(required.thinking)) {
    throw new Error(`HyAgents: ${modelSpec(name)} is not supported by the installed Pi model registry. Update Pi/provider configuration; do not lower thinking automatically.`);
  }
}
