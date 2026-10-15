import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { ROLES, modelSpec, type RoleName } from "../src/models.ts";
import { saveSelection } from "../src/native-settings.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = mkdtempSync(path.join(tmpdir(), "hyagents-runtime-"));
const agentDir = path.join(fixture, "agent");
mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_SUBAGENTS_TEMP_ROOT = path.join(fixture, "runs");
writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [root] }));

const { resolveSubagentLaunchContract } = await import("pi-subagents/preflight");
const { registerRequiredChildExtensions } = await import("pi-subagents/required-child-extensions");
// Test the pinned runtime's actual startup failure path, not a simulated event handler.
// Production code imports only the documented public required-child-extensions API.
const { createDefaultChildSessionFactory } = await import("../node_modules/pi-subagents/src/runs/shared/child-session.js");
const { discoverAgents } = await import("../node_modules/pi-subagents/src/agents/agents.js");
const { getModels } = await import("@earendil-works/pi-ai/compat");
const { Compile } = await import("typebox/compile");
const guard = fileURLToPath(new URL("../extensions/verify-child.ts", import.meta.url));
const registration = registerRequiredChildExtensions({ sessionId: "hyagents-test", extensions: [{ id: "hyagents.models", path: guard }] });
const sessionManagers = new Map<string, SessionManager>();
const sessions = new Map<string, any>();
const factory = createDefaultChildSessionFactory({
  loadPiCodingAgent: async () => {
    const pi = await import("@earendil-works/pi-coding-agent");
    return { ...pi, createAgentSession: async (...args: Parameters<typeof pi.createAgentSession>) => {
      const created = await pi.createAgentSession(...args);
      sessionManagers.set(created.session.sessionId, created.session.sessionManager);
      sessions.set(created.session.sessionId, created.session);
      return created;
    } };
  },
});

function retainUserTurn(sessionId: string): void {
  // Pi buffers a never-used session. A user turn persists the actual entries,
  // including the startup selection, without making a provider request.
  sessionManagers.get(sessionId)!.appendMessage({ role: "user", content: "Complete the assigned task.", timestamp: Date.now() });
}

after(async () => {
  await factory.dispose();
  registration.dispose();
  rmSync(fixture, { recursive: true, force: true });
});

test("installed package discovery preserves builtins and registers four namespaced agents", () => {
  const discovered = discoverAgents(fixture, "both");
  for (const name of Object.keys(ROLES)) {
    const agent = discovered.agents.find((item) => item.name === name);
    assert.ok(agent, name);
    assert.equal(agent.source, "package");
    assert.equal(agent.advertise, true);
    assert.equal(agent.tools, undefined, "no extra tool allowlist");
    assert.equal(agent.excludeTools, undefined);
    assert.equal(agent.defaultProgress, false, "no progress/checkpoint files");
  }
  assert.ok(discovered.agents.some((item) => item.name === "worker" && item.source === "builtin"));
});

for (const name of Object.keys(ROLES) as RoleName[]) {
  test(`${name}: real native discovery and preflight retain model, thinking, permissions and guard`, async () => {
    const result = await resolveSubagentLaunchContract({
      agent: name, cwd: fixture, parentSessionId: "hyagents-test", task: "Inspect the assignment.",
      availableModels: Object.values(ROLES).map(({ provider, id }) => getModels(provider).find((model) => model.id === id)!),
    });
    assert.ok(result.ok, JSON.stringify(result));
    const contract = result.contract;
    assert.equal(contract.model?.replace(/:(max|xhigh|high)$/, ""), modelSpec(name).replace(/:(max|xhigh|high)$/, ""));
    assert.equal(contract.thinking, ROLES[name].thinking);
    assert.equal(contract.tools.explicitAllowlist, false);
    assert.ok(contract.tools.requiredExtensionIds.includes("hyagents.models"));
    assert.equal(contract.context, "fresh");
    assert.equal(contract.inheritProjectContext, true);
  });

  test(`${name}: real child startup accepts the exact model/effort without calling a provider`, async () => {
    const child = await factory.create(launch(name, modelSpec(name)));
    assert.equal(child.modelId, `${ROLES[name].provider}/${ROLES[name].id}`);
    await child.dispose();
  });
}

function launch(name: string, model: string) {
  return {
    cwd: fixture,
    storage: { kind: "memory" as const },
    model,
    extensionPaths: [guard],
    requiredExtensions: [{ id: "hyagents.models", path: guard }],
    ambientExtensions: false,
    hooks: [],
    noSkills: true,
    noContextFiles: true,
    appendSystemPrompt: `<active_agent name="${name}"/>\n\nComplete the assignment.`,
    runtime: { fanoutChild: false, depth: 1, waitTool: { enabled: false, defaultTimeoutMs: 1000 }, fast: false },
  };
}

test("wrong native model fails startup instead of silently using a fallback", async () => {
  await assert.rejects(factory.create(launch("hyagents.worker", "openai-codex/gpt-6.1-sol:max")), /Required child extension failed during startup:.*HyAgents:.*requires/s);
});

test("lower thinking from a per-run override fails before a child can prompt", async () => {
  await assert.rejects(factory.create(launch("hyagents.worker", "openai-codex/gpt-6-luna:high")), /requires.*:max; resolved.*:high/s);
});

test("unrelated native agents are unaffected by HyAgents model checks", async () => {
  const child = await factory.create(launch("worker", "openai-codex/gpt-6.1-sol:low"));
  await child.dispose();
});

test("native reviewer schema accepts empty findings and rejects malformed priorities/ranges", () => {
  const agent = discoverAgents(fixture, "both").agents.find((item) => item.name === "hyagents.reviewer")!;
  assert.ok(agent.outputSchema);
  const validator = Compile(agent.outputSchema);
  const correct = { overall_correctness: "correct", explanation: "No actionable defects found.", confidence: 0.8, findings: [] };
  assert.ok(validator.Check(correct));
  const finding = { title: "Handle an empty token", body: "The new empty-token path throws before returning a response.", priority: 1, confidence: 0.95, file_path: "src/auth.ts", line_start: 5, line_end: 6 };
  const result = { ...correct, overall_correctness: "incorrect", findings: [finding] };
  assert.ok(validator.Check(result));
  assert.equal(validator.Check({ ...result, findings: [{ ...finding, priority: 4 }] }), false);
  assert.equal(validator.Check({ ...result, findings: [{ ...finding, line_start: 0 }] }), false);
  assert.equal(validator.Check({ ...correct, confidence: 2 }), false);
});

test("native thinking ceiling remains authoritative", async () => {
  const result = await resolveSubagentLaunchContract({ agent: "hyagents.worker", cwd: fixture, thinkingCeiling: "high" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "thinking_ceiling");
});

test("opening a retained native session still verifies model/effort before prompting", async () => {
  const first = await factory.create({ ...launch("hyagents.worker", modelSpec("hyagents.worker")), storage: { kind: "dir", sessionDir: path.join(fixture, "sessions") } });
  retainUserTurn(first.sessionId);
  const sessionFile = first.sessionFile;
  assert.ok(sessionFile);
  await first.dispose();
  const retained = { ...launch("hyagents.worker", modelSpec("hyagents.worker")), storage: { kind: "file" as const, sessionFile } };
  const resumed = await factory.create(retained);
  await resumed.dispose();
  await assert.rejects(factory.create({ ...retained, model: "openai-codex/gpt-6-luna:low" }), /HyAgents:.*requires/s);
});

test("saved choices apply to new real children while retained children keep their initial selection", async () => {
  const originalSettings = JSON.stringify({ packages: [root] });
  const initial = { provider: "openai-codex", id: "gpt-6.1-sol", thinking: "low" as const };
  try {
    await saveSelection(fixture, "hyagents.worker", initial, "user");
    const preflight = await resolveSubagentLaunchContract({ agent: "hyagents.worker", cwd: fixture });
    assert.ok(preflight.ok);
    assert.equal(preflight.contract.model, modelSpec(initial));
    const first = await factory.create({ ...launch("hyagents.worker", modelSpec(initial)), storage: { kind: "dir", sessionDir: path.join(fixture, "configured-sessions") } });
    retainUserTurn(first.sessionId);
    const sessionFile = first.sessionFile!;
    await first.dispose();
    await saveSelection(fixture, "hyagents.worker", ROLES["hyagents.worker"], "user");
    const fresh = await factory.create(launch("hyagents.worker", modelSpec("hyagents.worker")));
    await fresh.dispose();
    const resumed = await factory.create({ ...launch("hyagents.worker", modelSpec(initial)), storage: { kind: "file", sessionFile } });
    await resumed.dispose();
    await assert.rejects(factory.create({ ...launch("hyagents.worker", modelSpec("hyagents.worker")), storage: { kind: "file", sessionFile } }), /requires.*gpt-6.1-sol:low/);
  } finally {
    writeFileSync(path.join(agentDir, "settings.json"), originalSettings);
  }
});

async function providerPayload(sessionId: string): Promise<Record<string, unknown>> {
  return await sessions.get(sessionId)!.extensionRunner.emitBeforeProviderRequest({ model: "probe", input: [] }) as Record<string, unknown>;
}

test("Fast mode adds the priority service tier to new children and retained children keep their initial choice", async () => {
  const fastFile = path.join(agentDir, "hyagents.json");
  try {
    await saveSelection(fixture, "hyagents.worker", ROLES["hyagents.worker"], "user", true);
    const first = await factory.create({ ...launch("hyagents.worker", modelSpec("hyagents.worker")), storage: { kind: "dir", sessionDir: path.join(fixture, "fast-sessions") } });
    assert.deepEqual(await providerPayload(first.sessionId), { model: "probe", input: [], service_tier: "priority" });
    retainUserTurn(first.sessionId);
    const sessionFile = first.sessionFile!;
    await first.dispose();
    const unrelated = await factory.create(launch("worker", "openai-codex/gpt-6.1-sol:low"));
    assert.equal((await providerPayload(unrelated.sessionId)).service_tier, undefined, "non-HyAgents agents are untouched");
    await unrelated.dispose();

    await saveSelection(fixture, "hyagents.worker", ROLES["hyagents.worker"], "user", false);
    const fresh = await factory.create(launch("hyagents.worker", modelSpec("hyagents.worker")));
    assert.equal((await providerPayload(fresh.sessionId)).service_tier, undefined);
    await fresh.dispose();
    const resumed = await factory.create({ ...launch("hyagents.worker", modelSpec("hyagents.worker")), storage: { kind: "file", sessionFile } });
    assert.equal((await providerPayload(resumed.sessionId)).service_tier, "priority");
    await resumed.dispose();
  } finally {
    rmSync(fastFile, { force: true });
    writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [root] }));
  }
});

test("Fast mode on a non-OpenAI provider fails startup instead of being ignored", async () => {
  const fastFile = path.join(agentDir, "hyagents.json");
  writeFileSync(fastFile, JSON.stringify({ fast: { "hyagents.designer": true } }));
  try {
    await assert.rejects(factory.create(launch("hyagents.designer", modelSpec("hyagents.designer"))), /HyAgents:.*Fast mode.*supports only OpenAI/s);
  } finally { rmSync(fastFile, { force: true }); }
});
