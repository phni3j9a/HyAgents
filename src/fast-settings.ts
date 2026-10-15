import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RoleName } from "./models.ts";

/** HyAgents-owned Fast choices, stored next to the native settings file:
 * `{ "fast": { "hyagents.worker": true } }`. A separate file is used because
 * pi-subagents' native `fast` accepts only `openai-codex/*` and its settings
 * editor does not write unknown override fields. */
export const FAST_FILE = "hyagents.json";

interface FastFile { fast?: Record<string, boolean>; [key: string]: unknown }

function read(file: string): FastFile {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`HyAgents: failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`HyAgents: ${file} must contain a JSON object.`);
  const fast = (parsed as FastFile).fast;
  if (fast !== undefined && (!fast || typeof fast !== "object" || Array.isArray(fast) || Object.values(fast).some((value) => typeof value !== "boolean"))) {
    throw new Error(`HyAgents: ${file} has invalid 'fast'; expected an object of role names to booleans.`);
  }
  return parsed as FastFile;
}

/** Validated contents of a Fast file, or undefined when it does not exist. Throws before any write. */
export function readFastFile(file: string): FastFile | undefined {
  return existsSync(file) ? read(file) : undefined;
}

/** Atomically replace (or, for `undefined`, remove) a Fast file. Callers hold the file lease. */
export function writeFastFile(file: string, contents: FastFile | undefined): void {
  if (contents === undefined) { rmSync(file, { force: true }); return; }
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(contents, null, 2)}\n`);
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Write an explicit boolean so a project choice can turn off a user-level Fast setting. */
export function withFast(current: FastFile | undefined, name: RoleName, fast: boolean): FastFile {
  return { ...current, fast: { ...current?.fast, [name]: fast } };
}

/** Same user < project precedence as the native agentOverrides; untrusted projects are ignored. */
export function configuredFastFrom(projectRoot: string | undefined, name: RoleName): boolean {
  const project = projectRoot ? read(path.join(projectRoot, CONFIG_DIR_NAME, FAST_FILE)).fast?.[name] : undefined;
  return project ?? read(path.join(getAgentDir(), FAST_FILE)).fast?.[name] ?? false;
}

export type FastContext = Pick<ExtensionContext, "cwd" | "isProjectTrusted">;
