import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("real Pi loads both packages, enforces selection, and saves models through its registered command", async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "hyagents-parent-"));
  const agentDir = path.join(fixture, "agent");
  mkdirSync(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_SUBAGENTS_TEMP_ROOT = path.join(fixture, "runs");
  const root = fileURLToPath(new URL("../", import.meta.url));
  writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [path.join(root, "node_modules/pi-subagents"), root], compaction: { enabled: false } }));
  // Fail closed if a regression ever reaches network transport during this offline smoke.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Hybrid Subagents offline test forbids network requests"); };
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
  const runtime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: null, allowModelNetwork: false });
  const settings = SettingsManager.create(fixture, agentDir);
  const loader = new DefaultResourceLoader({ cwd: fixture, agentDir, settingsManager: settings });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({ cwd: fixture, agentDir, modelRuntime: runtime, model: runtime.getModel("openai-codex", "gpt-6.1-sol"), thinkingLevel: "low", settingsManager: settings, resourceLoader: loader, sessionManager: SessionManager.inMemory(fixture) }));
    const errors: string[] = [];
    await session.bindExtensions({ mode: "print", onError: (error) => errors.push(error.error) });
    assert.deepEqual(errors, []);
    assert.ok(session.getActiveToolNames().includes("subagents_enable"));
    const ctx = session.extensionRunner.createContext();
    const prompt = await session.extensionRunner.emitBeforeAgentStart("Investigate and implement the feature", undefined, { cwd: fixture, selectedTools: session.getActiveToolNames() });
    assert.match(prompt.systemPromptOptions.sections.hyagents ?? "", /subagents_enable/);
    assert.equal(session.model?.id, "gpt-6.1-sol");
    assert.equal(session.thinkingLevel, "low");
    const tool = session.getToolDefinition("subagent");
    assert.ok(tool);
    const toolContext = { ...ctx, tools: [], executeTool: async () => { throw new Error("No nested tool execution expected"); } };
    await assert.rejects(tool.execute("hyagents-wrong-thinking", { agent: "hyagents.worker", task: "Reply with a short result.", model: "openai-codex/gpt-6-luna:low", async: false }, undefined, undefined, toolContext), /Hybrid Subagents:.*requires/);
    const workflowPath = path.join(fixture, "parallel.js");
    writeFileSync(workflowPath, `return await runs.all([
      { key: "writer", agent: "hyagents.worker", task: "Inspect assigned code.", model: "openai-codex/gpt-6-luna:low", async: false },
      { key: "scout", agent: "hyagents.scout", task: "Find relevant code.", model: "openai-codex/gpt-6-luna:high", async: false }
    ]);`);
    const parallel = await tool.execute("hyagents-parallel", { workflow: workflowPath, async: false }, undefined, undefined, toolContext).catch((error: Error) => ({ error: error.message }));
    assert.match(JSON.stringify(parallel), /hyagents.worker requires/);
    assert.match(JSON.stringify(parallel), /hyagents.scout requires/);
    assert.deepEqual(errors, []);

    // Exercise the command loaded by Pi's real extension loader, including its
    // dynamic import of the native settings editor. Dialog answers replace user
    // interaction; only this offline fixture pretends models are authenticated.
    const command = session.extensionRunner.getCommand("hyagents");
    assert.ok(command);
    const commandCtx = { ...session.extensionRunner.createCommandContext(), hasUI: true };
    const answers = ["openai-codex", "gpt-6-luna", "high", "On — priority service tier (faster, higher usage/cost)", "User — all projects"];
    const notices: { text: string; type?: string }[] = [];
    commandCtx.modelRegistry.getAvailable = () => commandCtx.modelRegistry.getAll();
    commandCtx.ui = { ...commandCtx.ui,
      select: async (_title, options) => {
        const answer = answers.shift()!;
        assert.ok(options.includes(answer));
        return answer;
      },
      notify: (text, type) => notices.push({ text, type }),
    };
    await command.handler("models worker", commandCtx);
    assert.equal(answers.length, 0);
    assert.equal(notices.at(-1)?.type, "info", JSON.stringify(notices));
    const saved = JSON.parse(readFileSync(path.join(agentDir, "settings.json"), "utf8"));
    assert.equal(saved.subagents.agentOverrides["hyagents.worker"].model, "openai-codex/gpt-6-luna:high");
    assert.deepEqual(JSON.parse(readFileSync(path.join(agentDir, "hyagents.json"), "utf8")), { fast: { "hyagents.worker": true } });
    assert.equal(session.model?.id, "gpt-6.1-sol");
    assert.equal(session.thinkingLevel, "low");
    await command.handler("", commandCtx);
    assert.match(notices.at(-1)!.text, /hyagents.worker: openai-codex\/gpt-6-luna:high fast/);
  } finally {
    if (session) {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      session.dispose();
    }
    globalThis.fetch = originalFetch;
    rmSync(fixture, { recursive: true, force: true });
  }
});
