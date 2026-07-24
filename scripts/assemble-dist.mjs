import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stagedDist = join(root, ".build", "unified-dist");
const finalDist = join(root, "dist");

await rm(stagedDist, { recursive: true, force: true });
await mkdir(stagedDist, { recursive: true });
await cp(join(root, ".build", "frontend"), join(stagedDist, "public"), { recursive: true });
await cp(join(root, "backend"), join(stagedDist, "backend"), { recursive: true });
await rm(finalDist, { recursive: true, force: true });
await rename(stagedDist, finalDist);
console.log(`统一生产目录已生成：${finalDist}`);
