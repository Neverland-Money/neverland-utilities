import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      entry.name !== 'mocks.ts'
      ? [path]
      : [];
  });
}

test('shipped SDK source avoids BigInt exponentiation that bundlers can lower to Math.pow', () => {
  const paths = ['math-utils', 'contract-helpers'].flatMap(name =>
    sourceFiles(join(root, 'packages', name, 'src')),
  );
  const program = ts.createProgram(paths, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const isBigInt = node => {
    const type = checker.getTypeAtLocation(node);
    const variants = 'types' in type ? type.types : [type];
    // eslint-disable-next-line no-bitwise -- TypeScript represents bigint types with bitmask flags.
    return variants.some(variant => Boolean(variant.flags & ts.TypeFlags.BigIntLike));
  };

  const violations = [];
  for (const path of paths) {
    const source = program.getSourceFile(path);
    const visit = node => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken &&
        (isBigInt(node.left) || isBigInt(node.right))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${relative(root, path)}:${line + 1}`);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  assert.deepEqual(violations, []);
});
