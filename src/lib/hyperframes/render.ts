import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);
const hyperframesCli = path.join(
  process.cwd(),
  "node_modules/hyperframes/bin/hyperframes.mjs"
);

interface RenderOptions {
  compositionPath: string;
  outputPath: string;
  fps?: number;
  width?: number;
  height?: number;
}

export async function renderComposition(
  opts: RenderOptions
): Promise<string> {
  const { compositionPath, outputPath, fps = 30 } = opts;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const { stderr } = await execFileAsync(
      process.execPath,
      [
        hyperframesCli,
        "render",
        path.dirname(compositionPath),
        "--output",
        outputPath,
        "--fps",
        String(fps),
      ],
      {
      cwd: process.cwd(),
      timeout: 600_000,
      maxBuffer: 50 * 1024 * 1024,
      }
    );

    if (stderr && !stderr.includes("warn")) {
      console.error("Render stderr:", stderr);
    }

    await fs.access(outputPath);
    return outputPath;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Render failed: ${msg}`);
  }
}

export async function checkHyperframesDeps(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [hyperframesCli, "doctor"],
      { timeout: 30_000 }
    );
    return { ok: true, message: stdout };
  } catch {
    return {
      ok: false,
      message:
        "Hyperframes dependencies missing. Run: npm install hyperframes && ensure FFmpeg is installed.",
    };
  }
}
