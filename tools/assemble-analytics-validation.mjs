import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const analytics = new URL("../docs/analytics/", import.meta.url);
export const queryIds = ["q1", "q2a", "q2b", "q3", "q4"];

export function region(text, kind, id) {
  const pattern = new RegExp(`-- ${kind}:begin ${id}\\n([\\s\\S]*?)-- ${kind}:end ${id}(?:\\n|$)`, "g");
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected one ${kind} region for ${id}`);
  return matches[0][1];
}

export function assemble(production, validation) {
  return queryIds.map((id) => {
    const shared = id === "q2b" ? "q2a" : id;
    const transform = region(production, "transform", shared);
    return `${region(validation, "inputs", shared)}-- source:begin ${id} (synthetic)\n${region(validation, "source", shared)}-- source:end ${id} (synthetic)\n-- transform:begin ${id}\n${transform}-- transform:end ${id}\n${region(validation, "final", id)}`.trimEnd();
  });
}

export function readStatements() {
  return assemble(
    readFileSync(new URL("trial-baselines.sql", analytics), "utf8"),
    readFileSync(new URL("validate-trial-baselines.sql", analytics), "utf8"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(readStatements().join("\n\n;\n\n") + "\n");
}
