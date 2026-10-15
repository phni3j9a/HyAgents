import { getSupportedThinkingLevels, type Api, type Model } from "@earendil-works/pi-ai";

export const ROLES = {
  "hyagents.worker": { provider: "openai-codex", id: "gpt-6-luna", thinking: "max" },
  "hyagents.scout": { provider: "openai-codex", id: "gpt-6-luna", thinking: "xhigh" },
  "hyagents.reviewer": { provider: "openai-codex", id: "gpt-6.1-sol", thinking: "high" },
  "hyagents.designer": { provider: "anthropic", id: "claude-opus-5-5", thinking: "high" },
} as const;

export type RoleName = keyof typeof ROLES;
export type Thinking = ReturnType<typeof getSupportedThinkingLevels>[number];
export interface ModelSelection { provider: string; id: string; thinking: Thinking }
export const ROLE_NAMES = Object.keys(ROLES) as RoleName[];

/** Providers whose Responses requests accept OpenAI's priority service tier (Fast mode). */
const FAST_PROVIDERS = new Set(["openai", "openai-codex"]);
export const FAST_SERVICE_TIER = "priority";

export function supportsFast(provider: string): boolean {
  return FAST_PROVIDERS.has(provider);
}

export function describeSelection(selection: ModelSelection, fast: boolean): string {
  return `${modelSpec(selection)}${fast ? " fast" : ""}`;
}

export function assertFast(name: RoleName, selection: ModelSelection, fast: boolean): void {
  if (fast && !supportsFast(selection.provider)) {
    throw new Error(`HyAgents: ${name} enables Fast mode, which supports only OpenAI providers (openai, openai-codex); selected ${modelSpec(selection)}. Use /hyagents models to change the selection.`);
  }
}

export function isRole(name: string): name is RoleName {
  return Object.hasOwn(ROLES, name);
}

export function modelSpec(name: RoleName | ModelSelection): string {
  const role = typeof name === "string" ? ROLES[name] : name;
  return `${role.provider}/${role.id}:${role.thinking}`;
}

/** pi-subagents adds this launch-owned tag to each native child's system prompt. */
export function activeAgent(prompt: string): string | undefined {
  return /(?:^|\n)<active_agent name="([^"]+)"\/>/.exec(prompt)?.[1];
}

export function assertSelection(name: RoleName, model: Model<Api> | undefined, thinking: string, required: ModelSelection = ROLES[name]): void {
  const actual = model ? `${model.provider}/${model.id}:${thinking}` : "no model";
  if (!model || model.provider !== required.provider || model.id !== required.id || thinking !== required.thinking) {
    throw new Error(`HyAgents: ${name} requires ${modelSpec(required)}; resolved ${actual}. Use /hyagents models to change the selection; no automatic fallback is allowed.`);
  }
  if (!getSupportedThinkingLevels(model).includes(required.thinking)) {
    throw new Error(`HyAgents: ${modelSpec(required)} is not supported by the installed Pi model registry. Choose a supported thinking level with /hyagents models; do not lower it automatically.`);
  }
}

export function parseSelection(spec: string, thinking?: string): ModelSelection {
  const match = /^(\S+?)\/(.+):(off|minimal|low|medium|high|xhigh|max)$/.exec(spec);
  const qualified = match ? `${match[1]}/${match[2]}` : spec;
  const separator = qualified.indexOf("/");
  const level = match?.[3] ?? thinking;
  if (separator < 1 || separator === qualified.length - 1 || !level || !/^(off|minimal|low|medium|high|xhigh|max)$/.test(level)) {
    throw new Error(`HyAgents requires an explicit provider/model and thinking level: ${spec}. Select them with /hyagents models.`);
  }
  return { provider: qualified.slice(0, separator), id: qualified.slice(separator + 1), thinking: level as Thinking };
}
