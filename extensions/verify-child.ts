import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeAgent, assertSelection, isRole } from "../src/models.ts";

/** Loaded by pi-subagents as a required extension, including foreground and resumed children.
 * Required session_start failures terminate startup before the first provider request.
 * Throwing from before_agent_start alone would NOT provide this guarantee in Pi.
 */
export default function verifyChild(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    const name = activeAgent(ctx.getSystemPrompt());
    if (name && isRole(name)) assertSelection(name, ctx.model, pi.getThinkingLevel());
  });
}
