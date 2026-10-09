import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeAgent, assertSelection, isRole, modelSpec, parseSelection } from "../src/models.ts";
import { configuredSelection } from "../src/native-settings.ts";

const ENTRY = "hyagents.model-selection.v1";

/** Loaded by pi-subagents as a required extension, including foreground and resumed children.
 * Required session_start failures terminate startup before the first provider request.
 * Throwing from before_agent_start alone would NOT provide this guarantee in Pi.
 */
export default function verifyChild(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const name = activeAgent(ctx.getSystemPrompt());
    if (!name || !isRole(name)) return;
    // A native custom entry keeps a retained child's original selection across
    // settings changes without adding files or a separate session protocol.
    const saved = ctx.sessionManager.getEntries().find((entry) => entry.type === "custom" && entry.customType === ENTRY);
    let required;
    if (saved?.type === "custom") {
      const data = saved.data as { agent?: unknown; model?: unknown } | undefined;
      if (data?.agent !== name || typeof data.model !== "string") throw new Error("HyAgents: invalid retained model selection.");
      required = parseSelection(data.model);
    } else {
      required = await configuredSelection(name, ctx);
    }
    assertSelection(name, ctx.model, pi.getThinkingLevel(), required);
    if (!saved) pi.appendEntry(ENTRY, { agent: name, model: modelSpec(required) });
  });
}
