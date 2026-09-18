#!/usr/bin/env node
/**
 * Report when a change alters a contract installed apps already depend on.
 *
 * A Convex deploy reaches every build in the wild at once, and a public
 * function's `args` and `returns` validators are the contract each of those
 * builds was compiled against. Narrowing either one breaks an old app the
 * moment the backend deploys. CLAUDE.md answers this with expand, deploy,
 * move the client, contract, and nothing checked that anyone did.
 *
 * Reading the diff is not enough, because the validator that moved is usually
 * not written at the function. `returns: v.array(enrichedItemValidator)` never
 * changes while the shape it promises changes underneath it. So each public
 * function's validators are resolved to their full text, following every
 * identifier they reference through the convex tree, and that closure is what
 * gets compared, together with the registrar the function was declared with. A
 * query an app reaches over one transport is not the mutation it becomes, and
 * a function that loses its `export` leaves the API without its body moving at
 * all, so both count as changes to the contract.
 *
 * A new function is additive and passes. A removed or changed one fails, until
 * a commit in the range carries
 *
 *   Convex-Api: changed
 *
 * which is the author saying they have checked the change is one an installed
 * app survives, or that they are deploying it ahead of the client on purpose.
 *
 * Usage: node tools/verify-convex-api.mjs <base-ref> [head-ref]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { posix } from "node:path";

import ts from "typescript";

import { trailerValues } from "./git-trailer.mjs";
import { isMainModule } from "./main-module.mjs";

const CONVEX_DIR = "apps/native/convex";
const TRAILER_KEY = "Convex-Api";
const TRAILER_VALUE = "changed";
const ACKNOWLEDGEMENT = `${TRAILER_KEY}: ${TRAILER_VALUE}`;

// Only these reach an installed app. internalQuery and friends are callable
// from the backend alone, so their shape is nobody's contract.
const PUBLIC_REGISTRARS = new Set(["query", "mutation", "action"]);
const CONTRACT_PROPERTIES = new Set(["args", "returns"]);

/** The convex modules Convex would bundle, at `ref`. */
function convexFiles(ref) {
  const output = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", CONVEX_DIR],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter(
      (path) =>
        path.endsWith(".ts") &&
        !path.includes("/_generated/") &&
        !path.endsWith(".test.ts") &&
        !path.endsWith("test.setup.ts"),
    );
}

/** Every convex module at `ref`, as path to source. */
export function treeAt(ref) {
  return new Map(
    convexFiles(ref).map((path) => [
      path,
      execFileSync("git", ["show", `${ref}:${path}`], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      }),
    ]),
  );
}

/** The Convex API path of a module, so a report names `items`, not a file. */
export function moduleName(path) {
  return path.slice(`${CONVEX_DIR}/`.length).replace(/\.ts$/, "");
}

function resolveImport(fromPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  return `${posix.normalize(posix.join(posix.dirname(fromPath), specifier))}.ts`;
}

/**
 * The top-level declarations, relative imports and public functions of one
 * module. Declarations are kept as nodes because resolving a validator means
 * walking into whatever it references.
 */
function parseModule(path, source) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  const declarations = new Map();
  const imports = new Map();
  // Local name to its registrar and contract nodes. Only exported ones are the
  // API, and a module may export a name well after declaring it, so the two are
  // collected apart and joined once the whole file has been read.
  const registrars = new Map();
  const exported = new Map();

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const target = resolveImport(path, statement.moduleSpecifier.text);
      const bindings = statement.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            path: target,
            name: (element.propertyName ?? element.name).text,
          });
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause || !ts.isNamedExports(clause)) continue;
      const target = statement.moduleSpecifier
        ? resolveImport(path, statement.moduleSpecifier.text)
        : null;
      for (const element of clause.elements) {
        const local = (element.propertyName ?? element.name).text;
        exported.set(element.name.text, local);
        // `export { x } from "./y"` binds a name this module never imported,
        // so record where it lives or the walk has nowhere to go.
        if (target) {
          imports.set(element.name.text, { path: target, name: local });
        }
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      continue;
    }

    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      declarations.set(name, declaration);
      if (isExported) exported.set(name, name);

      const call = declaration.initializer;
      const isPublic =
        call &&
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        PUBLIC_REGISTRARS.has(call.expression.text);
      if (!isPublic) continue;

      const config = call.arguments[0];
      if (!config || !ts.isObjectLiteralExpression(config)) continue;
      const contract = config.properties.filter(
        (property) =>
          property.name &&
          ts.isIdentifier(property.name) &&
          CONTRACT_PROPERTIES.has(property.name.text),
      );
      registrars.set(name, { registrar: call.expression.text, contract });
    }
  }

  // Dropping the `export` is how a function leaves the API with its body
  // untouched, which is a removal an installed app feels.
  const publics = new Map();
  for (const [name, local] of exported) {
    const found = registrars.get(local);
    if (found) publics.set(name, found);
  }

  return { declarations, imports, publics };
}

export function parseTree(tree) {
  return new Map(
    [...tree].map(([path, source]) => [path, parseModule(path, source)]),
  );
}

/**
 * Identifiers the node depends on. A property name is skipped, so `v.array`
 * contributes `v` and an object key contributes nothing: neither can carry a
 * definition this tree owns.
 */
function referencedNames(node) {
  const names = new Set();
  const visit = (current) => {
    if (ts.isIdentifier(current)) {
      const parent = current.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === current) ||
        (ts.isPropertyAssignment(parent) && parent.name === current) ||
        (ts.isPropertySignature(parent) && parent.name === current);
      if (!isPropertyName) names.add(current.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return names;
}

const normalize = (text) => text.replace(/\s+/g, " ").trim();

/**
 * The text a public function's contract actually resolves to, including every
 * declaration it reaches. Sorted, so the same contract hashes the same however
 * the modules were walked.
 */
export function contractParts(modules, path, nodes) {
  const parts = new Map();
  const seen = new Set();

  // A module can hand a name straight through (`export { x }` over an import of
  // it), so the module an import names is not always the one that declares it.
  const resolve = (binding) => {
    const hops = new Set();
    let current = binding;
    while (current) {
      const key = `${current.path}#${current.name}`;
      if (hops.has(key)) return null;
      hops.add(key);
      const target = modules.get(current.path);
      if (!target) return null;
      const declaration = target.declarations.get(current.name);
      if (declaration) return { ...current, declaration };
      current = target.imports.get(current.name);
    }
    return null;
  };

  const follow = (currentPath, node) => {
    const parsed = modules.get(currentPath);
    if (!parsed) return;
    for (const name of referencedNames(node)) {
      const local = parsed.declarations.get(name);
      if (local) {
        const key = `${currentPath}#${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        parts.set(key, normalize(local.getText()));
        follow(currentPath, local);
        continue;
      }
      const imported = resolve(parsed.imports.get(name));
      if (!imported) continue;
      const key = `${imported.path}#${imported.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.set(key, normalize(imported.declaration.getText()));
      follow(imported.path, imported.declaration);
    }
  };

  const own = nodes.map((node) => normalize(node.getText())).sort();
  for (const node of nodes) follow(path, node);
  return [...own, ...[...parts].sort().map(([key, text]) => `${key} ${text}`)];
}

/** Every public function at a ref, as `module:name` to a contract hash. */
export function signatures(tree) {
  const modules = parseTree(tree);
  const result = new Map();
  for (const [path, parsed] of modules) {
    for (const [name, { registrar, contract }] of parsed.publics) {
      // An installed app reaches a query and a mutation over different
      // transports, so flipping one breaks it while every validator holds
      // still.
      const parts = [registrar, ...contractParts(modules, path, contract)];
      result.set(
        `${moduleName(path)}:${name}`,
        createHash("sha256")
          .update(parts.join("\n"))
          .digest("hex")
          .slice(0, 12),
      );
    }
  }
  return result;
}

/** Added functions are additive. Removed and changed ones are not. */
export function diffSignatures(base, head) {
  const added = [...head.keys()].filter((key) => !base.has(key)).sort();
  const removed = [...base.keys()].filter((key) => !head.has(key)).sort();
  const changed = [...head.keys()]
    .filter((key) => base.has(key) && base.get(key) !== head.get(key))
    .sort();
  return { added, removed, changed };
}

export function isBreaking({ removed, changed }) {
  return removed.length > 0 || changed.length > 0;
}

export function isAcknowledged(values) {
  return values.some((value) => value.trim() === TRAILER_VALUE);
}

export function formatReport({ baseRef, headRef, diff, acknowledged }) {
  const lines = [`convex api  base=${baseRef}  head=${headRef}`];
  const section = (label, keys) => {
    if (keys.length === 0) return;
    lines.push("", `  ${label}`);
    for (const key of keys) lines.push(`    ${key}`);
  };
  section("changed contract", diff.changed);
  section("removed", diff.removed);
  section("added (additive, does not fail)", diff.added);

  if (!isBreaking(diff)) {
    lines.push("", "  No public contract was narrowed.");
    return lines.join("\n");
  }
  if (acknowledged) {
    lines.push("", `  Acknowledged by a ${ACKNOWLEDGEMENT} trailer.`);
    return lines.join("\n");
  }
  lines.push(
    "",
    "  A Convex deploy reaches every installed build at once, so a narrowed",
    "  contract breaks apps already in the wild. Expand first, deploy, move",
    "  the client, and contract once no old build calls it.",
    "",
    "  If this change is one an installed app survives, or is the expand half",
    "  of that sequence, add this trailer to a commit in the range:",
    "",
    `    ${ACKNOWLEDGEMENT}`,
  );
  return lines.join("\n");
}

function main(argv) {
  const [baseRef, headRef = "HEAD"] = argv.filter(
    (argument) => !argument.startsWith("--"),
  );
  if (!baseRef) {
    process.stderr.write(
      "usage: verify-convex-api.mjs <base-ref> [head-ref]\n",
    );
    return 2;
  }

  const diff = diffSignatures(
    signatures(treeAt(baseRef)),
    signatures(treeAt(headRef)),
  );
  const acknowledged = isAcknowledged(
    trailerValues(".", `${baseRef}..${headRef}`, TRAILER_KEY),
  );
  process.stdout.write(
    `${formatReport({ baseRef, headRef, diff, acknowledged })}\n`,
  );
  return isBreaking(diff) && !acknowledged ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

export { ACKNOWLEDGEMENT, TRAILER_KEY };
