import { copyFile, mkdir } from "node:fs/promises";

const source = new URL("../node_modules/@fontsource/ibm-plex-sans-thai/", import.meta.url);
const target = new URL("../public/fonts/ibm-plex/", import.meta.url);
await mkdir(target, { recursive: true });
for (const subset of ["thai", "latin"]) {
  for (const weight of [400, 500, 600, 700]) {
    const name = `ibm-plex-sans-thai-${subset}-${weight}-normal.woff2`;
    await copyFile(new URL(`files/${name}`, source), new URL(name, target));
  }
}
await copyFile(new URL("LICENSE", source), new URL("OFL.txt", target));
