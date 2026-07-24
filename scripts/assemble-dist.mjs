import { chmod, cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stagedDist = join(root, ".build", "unified-dist");
const finalDist = join(root, "dist");

await rm(stagedDist, { recursive: true, force: true });
await mkdir(stagedDist, { recursive: true });
await cp(join(root, ".build", "frontend"), join(stagedDist, "public"), { recursive: true });
await cp(join(root, "backend"), join(stagedDist, "backend"), { recursive: true });
await chmod(join(stagedDist, "backend"), 0o755);
for (const entry of await readdir(join(stagedDist, "backend"))) {
  if (entry.endsWith(".mjs") || entry.endsWith(".md")) {
    await chmod(join(stagedDist, "backend", entry), 0o644);
  }
}
await rm(finalDist, { recursive: true, force: true });
await rename(stagedDist, finalDist);
console.log(`统一生产目录已生成：${finalDist}`);
