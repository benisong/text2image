import "server-only";

import path from "node:path";

export function resolveDataPath(...segments: string[]) {
  return path.join(/* turbopackIgnore: true */ process.cwd(), ...segments);
}
