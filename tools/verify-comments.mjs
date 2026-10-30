#!/usr/bin/env node
import { execFileSync } from "node:child_process";

import ts from "typescript";

import { trailerValues } from "./git-trailer.mjs";
import { isMainModule } from "./main-module.mjs";

const TRAILER_KEY = "Comments";
const TRAILER_VALUE = "kept";
const ACKNOWLEDGEMENT = `${TRAILER_KEY}: ${TRAILER_VALUE}`;
const SOURCE = /^(apps|tools)\/.*\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIPPED =
  /\/(_generated|node_modules)\/|\/locales\/(catalogs|message-types)\.ts$/;
const PRAGMA =
  /^\/\/\/\s*<reference|eslint-(disable|enable)|@ts-(expect-error|ignore|nocheck)|@vitest-environment|prettier-ignore|[#@]__PURE__|istanbul ignore|c8 ignore/;

export function isChecked(path) {
  return SOURCE.test(path) && !SKIPPED.test(path);
}

function scriptKind(path) {
  if (/\.tsx$/.test(path)) return ts.ScriptKind.TSX;
  if (/\.[mc]?jsx?$/.test(path)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

export function comments(path, source) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path),
  );
  const found = new Map();
  const add = (ranges) => {
    for (const { pos, end } of ranges ?? []) {
      found.set(pos, source.slice(pos, end));
    }
  };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    add(ts.getLeadingCommentRanges(source, node.pos));
    add(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...found.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pos, text]) => ({
      line: file.getLineAndCharacterOfPosition(pos).line + 1,
      text,
    }))
    .filter(({ text }) => !PRAGMA.test(text));
}

const normalize = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

export function addedComments(path, baseSource, headSource) {
  const base = baseSource ? comments(path, baseSource) : [];
  const head = comments(path, headSource);
  if (head.length <= base.length) return [];
  const remaining = new Map();
  for (const { text } of base) {
    const key = normalize(text);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return head.filter(({ text }) => {
    const key = normalize(text);
    const left = remaining.get(key) ?? 0;
    if (left === 0) return true;
    remaining.set(key, left - 1);
    return false;
  });
}

export function formatReport({ baseRef, headRef, added, acknowledged }) {
  const lines = [`comments  base=${baseRef}  head=${headRef}`];
  if (added.length === 0) {
    lines.push("", "  No comment added.");
    return lines.join("\n");
  }
  lines.push("");
  for (const { path, line, text } of added) {
    lines.push(`  ${path}:${line}  ${text.split("\n")[0].slice(0, 100)}`);
  }
  if (acknowledged) {
    lines.push("", `  Acknowledged by a ${ACKNOWLEDGEMENT} trailer.`);
    return lines.join("\n");
  }
  lines.push(
    "",
    `  ${added.length} comment(s) added. This repo removes comments with`,
    "  /pstack:no-comments (#364, #421, #466, #467, #474). Run it on this",
    "  branch now: it deletes the comment or says it in code instead (a",
    "  name, a type, a constant, a test).",
    "",
    "  A comment it keeps states a rule of something we cannot change (a",
    "  dependency, platform, vendor or protocol, or a licence). Name that",
    "  rule in the commit body and add this trailer to the commit:",
    "",
    `    ${ACKNOWLEDGEMENT}`,
  );
  return lines.join("\n");
}

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function forkPoint(baseRef, headRef) {
  try {
    return git("merge-base", baseRef, headRef).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
    throw new Error(
      `${baseRef} and ${headRef} share no history. Fetch it all (actions/checkout fetch-depth: 0).`,
    );
  }
}

export function changedFiles(fork, headRef) {
  const output = git(
    "diff",
    "--name-status",
    "-M",
    "--diff-filter=AMR",
    fork,
    headRef,
  );
  return output
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [status, first, second] = row.split("\t");
      return status.startsWith("R")
        ? { base: first, head: second }
        : { base: status === "A" ? null : first, head: first };
    })
    .filter(({ head }) => isChecked(head));
}

export function verify(baseRef, headRef) {
  const fork = forkPoint(baseRef, headRef);
  const added = changedFiles(fork, headRef).flatMap(({ base, head }) =>
    addedComments(
      head,
      base ? git("show", `${fork}:${base}`) : null,
      git("show", `${headRef}:${head}`),
    ).map((comment) => ({ path: head, ...comment })),
  );
  const acknowledged = trailerValues(
    ".",
    `${fork}..${headRef}`,
    TRAILER_KEY,
  ).some((value) => value === TRAILER_VALUE);
  return { fork, added, acknowledged };
}

function main(argv) {
  const [baseRef, headRef = "HEAD"] = argv;
  if (!baseRef) {
    process.stderr.write("usage: verify-comments.mjs <base-ref> [head-ref]\n");
    return 2;
  }
  const { fork, added, acknowledged } = verify(baseRef, headRef);
  process.stdout.write(
    `${formatReport({
      baseRef: `${baseRef} (fork ${fork.slice(0, 9)})`,
      headRef,
      added,
      acknowledged,
    })}\n`,
  );
  return added.length > 0 && !acknowledged ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

export { ACKNOWLEDGEMENT };
