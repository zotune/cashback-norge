import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync(new URL("../src/backend/index.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const parallelCrawls: ts.VariableDeclaration[] = [];
let publishedOffers: ts.ArrayLiteralExpression | undefined;

function visit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    if (
      ts.isArrayBindingPattern(node.name) &&
      ts.isAwaitExpression(node.initializer) &&
      ts.isCallExpression(node.initializer.expression) &&
      node.initializer.expression.expression.getText(source) === "Promise.all"
    ) {
      parallelCrawls.push(node);
    }
    if (node.name.getText(source) === "offersBeforeCoupert" && ts.isArrayLiteralExpression(node.initializer)) {
      publishedOffers = node.initializer;
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);

// A dropped Promise.all result does not fail TypeScript or the crawl: the
// provider logs success while its offers silently disappear from publication.
test("every parallel crawl result is assigned without shifting later sources", () => {
  assert.ok(parallelCrawls.length > 0);
  for (const declaration of parallelCrawls) {
    const names = declaration.name as ts.ArrayBindingPattern;
    const call = (declaration.initializer as ts.AwaitExpression).expression as ts.CallExpression;
    const requests = call.arguments[0];
    assert.ok(requests !== undefined && ts.isArrayLiteralExpression(requests));
    assert.equal(names.elements.length, requests.elements.length,
      `Crawl group starting with ${names.elements[0]!.getText(source)} must retain every result`);
    assert.ok(names.elements.every(ts.isBindingElement), "No crawl result may be omitted");
  }
});

test("every parallel source reaches the offers used to build the published index", () => {
  assert.ok(publishedOffers !== undefined);
  const included = new Set(publishedOffers.elements
    .filter(ts.isSpreadElement)
    .map((element) => element.expression.getText(source)));
  for (const declaration of parallelCrawls) {
    const names = declaration.name as ts.ArrayBindingPattern;
    for (const element of names.elements) {
      assert.ok(ts.isBindingElement(element));
      const name = element.name.getText(source);
      assert.ok(included.has(name), `${name} must reach the published index`);
    }
  }
});
