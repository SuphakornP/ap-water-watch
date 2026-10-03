import { copyFile, mkdir } from "node:fs/promises";
const target = new URL("../public/vendor/maplibre/", import.meta.url);
await mkdir(target, { recursive: true });
// Serve worker modules without the framework's window-only dev overlay injection.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(
    new URL(`../node_modules/maplibre-gl/dist/${file}`, import.meta.url),
    new URL(file, target),
  );
}
await copyFile(
  new URL("../node_modules/maplibre-gl/LICENSE.txt", import.meta.url),
  new URL("LICENSE.txt", target),
);
