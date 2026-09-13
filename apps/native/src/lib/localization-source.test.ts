import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import en from "@/locales/en.json";

const brands = new Set(["Shelvr", "shelvr", "Shelvr Pro", "Pro", "TikTok"]);
const visibleProperty =
  /^(title|label|message|text|placeholder|headline|support)$|(?:Label|Hint|Title)$/;

function alertReceivers(source: ts.SourceFile): Set<string> {
  const receivers = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "react-native"
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === "Alert")
          receivers.add(binding.name.text);
      }
    }
  }
  return receivers;
}

function untranslatedLiterals(text: string, file = "example.tsx"): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const alerts = alertReceivers(source);
  const issues: string[] = [];
  const record = (node: ts.Node, message: string) => {
    const line =
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    issues.push(`${file}:${line}: ${message}`);
  };
  const checkVisible = (node: ts.Node, allowKey = false) => {
    if (
      ts.isStringLiteralLike(node) &&
      /[A-Za-z]/.test(node.text) &&
      !brands.has(node.text) &&
      !(allowKey && Object.hasOwn(en, node.text))
    ) {
      record(node, `untranslated visible literal: ${node.text}`);
    }
    if (ts.isConditionalExpression(node)) {
      checkVisible(node.whenTrue, allowKey);
      checkVisible(node.whenFalse, allowKey);
    }
    if (ts.isJsxExpression(node) && node.expression)
      checkVisible(node.expression);
  };
  const checkKey = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) && !Object.hasOwn(en, node.text))
      record(node, `missing catalog key: ${node.text}`);
    if (ts.isConditionalExpression(node)) {
      checkKey(node.whenTrue);
      checkKey(node.whenFalse);
    }
    // Non-literal keys are constrained by t()'s generated MessageKey type.
    // This also checks arrays/maps and required interpolation parameters in tsc.
  };
  const checkAlertButtons = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
      node.name.text === "text"
    )
      checkVisible(node.initializer, true);
    ts.forEachChild(node, checkAlertButtons);
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxText(node) &&
      /[A-Za-z]/.test(node.text) &&
      !brands.has(node.text.trim())
    )
      record(node, "untranslated JSX text");
    if (
      ts.isJsxExpression(node) &&
      !ts.isJsxAttribute(node.parent) &&
      node.expression
    )
      checkVisible(node.expression);
    if (
      ts.isJsxAttribute(node) &&
      visibleProperty.test(node.name.getText(source)) &&
      node.initializer
    )
      checkVisible(node.initializer);
    if (
      ts.isPropertyAssignment(node) &&
      /^(title|label|placeholder)$|(?:Label|Hint|Title)$/.test(
        node.name.getText(source),
      )
    )
      checkVisible(node.initializer, true);
    if (ts.isCallExpression(node)) {
      if (node.expression.getText(source) === "renderFallback")
        node.arguments.slice(0, 2).forEach((arg) => checkVisible(arg));
      if (node.expression.getText(source) === "t" && node.arguments[0])
        checkKey(node.arguments[0]);
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "alert" &&
        alerts.has(node.expression.expression.getText(source))
      ) {
        node.arguments.slice(0, 2).forEach((arg) => checkVisible(arg));
        if (node.arguments[2]) checkAlertButtons(node.arguments[2]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}

it.each([
  '<Failure retryLabel="Try again" cancelLabel="Cancel" />',
  '<Stack.Screen options={{ title: "spaces" }} />',
  '<Text>{count === 1 ? "1 deleted" : t("tidy.deletedCount", { count })}</Text>',
  '<Failure retryLabel={failed ? "Retry" : "Done"} />',
  'import { Alert } from "react-native"; Alert.alert("Could not save", "Try again.")',
  'import { Alert } from "react-native"; Alert.alert(t("common.save"), undefined, [{ text: "Retry" }])',
  'import { Alert as NativeAlert } from "react-native"; NativeAlert.alert(t("common.save"), undefined, [{ text: failed ? "Retry" : "Done" }])',
  'import { Alert } from "react-native"; Alert.alert(t("common.save"), undefined, [{ "text": `Cancel` }])',
  "const label = t(`missing.key`);",
  'renderFallback("Camera access needed", t("capture.cameraAccessBody"), permissionButton)',
  'renderFallback(t("capture.noCameraTitle"), "This device has no camera (hello, Simulator).")',
])("detects untranslated regression: %s", (source) => {
  expect(untranslatedLiterals(source).length).toBeGreaterThan(0);
});

it("allows translated copy, user content and stable technical identities", () => {
  expect(
    untranslatedLiterals(
      '<Text>{item.title}</Text>; <Button testID="save" label={t("common.save")} />',
    ),
  ).toEqual([]);
  expect(
    untranslatedLiterals(
      'renderFallback(t("capture.cameraAccessTitle"), t("capture.cameraAccessBody"), permissionButton)',
    ),
  ).toEqual([]);
});

it("checks Alert buttons without treating technical text mappings as copy", () => {
  expect(
    untranslatedLiterals(`
      import { Alert } from "react-native";
      Alert.alert(t("common.save"), undefined, [
        { text: t("common.cancel") },
        { text: "common.save" },
        { text: item.title },
      ]);
      const icons = { message: "message", text: "text" };
    `),
  ).toEqual([]);
  expect(
    untranslatedLiterals(`
      import { Alert } from "monitoring";
      Alert.alert("internal event", "internal detail", [{ text: "internal value" }]);
    `),
  ).toEqual([]);
});

it("keeps visible literals and translation keys inside the source catalog", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !file.includes(".test.") &&
      !file.startsWith("locales/"),
  );
  const issues = files.flatMap((file) =>
    untranslatedLiterals(readFileSync(`${root}/${file}`, "utf8"), file),
  );
  expect(issues).toEqual([]);
});
