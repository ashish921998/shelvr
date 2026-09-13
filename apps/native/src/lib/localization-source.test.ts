import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import en from "@/locales/en.json";

it("keeps visible literals and translation keys inside the source catalog", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !file.includes(".test.") &&
      !file.startsWith("locales/"),
  );
  const issues: string[] = [];
  const brands = new Set(["Shelvr", "shelvr", "Shelvr Pro", "Pro", "TikTok"]);
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(`${root}/${file}`, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const record = (node: ts.Node, message: string) => {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      issues.push(`${file}:${line}: ${message}`);
    };
    const checkKey = (node: ts.Node) => {
      if (ts.isStringLiteral(node) && !Object.hasOwn(en, node.text))
        record(node, `missing catalog key: ${node.text}`);
      if (ts.isConditionalExpression(node)) {
        checkKey(node.whenTrue);
        checkKey(node.whenFalse);
      }
    };
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxText(node) &&
        /[A-Za-z]/.test(node.text) &&
        !brands.has(node.text.trim())
      ) {
        record(node, "untranslated JSX text");
      }
      if (
        ts.isJsxAttribute(node) &&
        /^(title|label|message|placeholder|accessibilityLabel|accessibilityHint|headline|support|ctaLabel)$/.test(
          node.name.getText(source),
        )
      ) {
        const value = node.initializer;
        if (
          value &&
          ts.isStringLiteral(value) &&
          /[A-Za-z]/.test(value.text) &&
          !brands.has(value.text)
        )
          record(node, "untranslated visible property");
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        node.arguments[0]
      )
        checkKey(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(issues).toEqual([]);
});
