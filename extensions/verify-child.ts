import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeAgent, assertFast, assertSelection, FAST_SERVICE_TIER, isRole, modelSpec, parseSelection, supportsFast } from "../src/models.ts";
import { configuredFast, configuredSelection } from "../src/native-settings.ts";

const ENTRY = "hyagents.model-selection.v1";

/** Loaded by pi-subagents as a required extension, including foreground and resumed children.
 * Required session_start failures terminate startup before the first provider request.
 * Throwing from before_agent_start alone would NOT provide this guarantee in Pi.
 */
export default function verifyChild(pi: ExtensionAPI): void {
  let fast = false;

  pi.on("session_start", async (_event, ctx) => {
    fast = false;
    const name = activeAgent(ctx.getSystemPrompt());
    if (!name || !isRole(name)) return;
    // A native custom entry keeps a retained child's original selection across
    // settings changes without adding files or a separate session protocol.
    const saved = ctx.sessionManager.getEntries().find((entry) => entry.type === "custom" && entry.customType === ENTRY);
    let required;
    let wantsFast;
    if (saved?.type === "custom") {
      const data = saved.data as { agent?: unknown; model?: unknown; fast?: unknown } | undefined;
      if (data?.agent !== name || typeof data.model !== "string" || (data.fast !== undefined && typeof data.fast !== "boolean")) {
        throw new Error("HyAgents: invalid retained model selection.");
      }
      required = parseSelection(data.model);
      // Entries written before Fast mode existed ran at the standard tier.
      wantsFast = data.fast === true;
    } else {
      required = await configuredSelection(name, ctx);
      wantsFast = await configuredFast(name, ctx);
    }
    assertSelection(name, ctx.model, pi.getThinkingLevel(), required);
    assertFast(name, required, wantsFast);
    if (!saved) pi.appendEntry(ENTRY, { agent: name, model: modelSpec(required), fast: wantsFast });
    fast = wantsFast;
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!fast || !ctx.model || !supportsFast(ctx.model.provider)) return;
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    return { ...payload, service_tier: FAST_SERVICE_TIER };
  });
}
