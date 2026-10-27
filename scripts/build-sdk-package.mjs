/** Emit both module graphs with compiler-owned specifiers and source/declaration maps. */
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const diagnosticsHost = {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => '\n',
};
function checkDiagnostics(diagnostics) {
  if (diagnostics.some(item => item.category === ts.DiagnosticCategory.Error))
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticsHost));
}

/** Resolve against source files, then let TypeScript emit the modified AST and its maps. */
function esmSpecifiers(options) {
  return context => source => {
    const { factory } = context;
    const specifier = literal => {
      if (!ts.isStringLiteral(literal) || !literal.text.startsWith('.')) return literal;
      const resolved = ts.resolveModuleName(
        literal.text,
        source.fileName,
        options,
        ts.sys,
      ).resolvedModule;
      assert.ok(resolved, `Unresolved relative module ${literal.text} in ${source.fileName}`);
      const extension = resolved.resolvedFileName.endsWith('.json') ? '.json' : '.js';
      const target = resolved.resolvedFileName.replace(/\.(?:d\.)?ts$|\.json$/, extension);
      let path = relative(dirname(source.fileName), target).replaceAll('\\', '/');
      if (!path.startsWith('.')) path = './' + path;
      return factory.createStringLiteral(path);
    };

    const attributes = (literal, original) =>
      literal.text.endsWith('.json')
        ? factory.createImportAttributes([
            factory.createImportAttribute(
              factory.createIdentifier('type'),
              factory.createStringLiteral('json'),
            ),
          ])
        : original;
    const visit = node => {
      if (ts.isImportDeclaration(node)) {
        const next = specifier(node.moduleSpecifier);
        return factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          next,
          attributes(next, node.attributes),
        );
      }

      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const next = specifier(node.moduleSpecifier);
        return factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          next,
          attributes(next, node.attributes),
        );
      }

      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        return factory.updateImportTypeNode(
          node,
          factory.updateLiteralTypeNode(node.argument, specifier(node.argument.literal)),
          node.attributes,
          node.qualifier,
          node.typeArguments,
        );
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return factory.updateCallExpression(node, node.expression, node.typeArguments, [
          specifier(node.arguments[0]),
          ...node.arguments.slice(1),
        ]);
      }

      return ts.visitEachChild(node, visit, context);
    };

    return ts.visitNode(source, visit);
  };
}

export function buildSdkPackage(name, root = repository) {
  assert.match(name, /^[a-z][a-z0-9-]*$/);
  const directory = join(root, 'packages', name);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(directory, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => checkDiagnostics([diagnostic]),
    },
  );
  assert.ok(parsed);
  checkDiagnostics(parsed.errors);
  for (const build of ['esm', 'cjs']) {
    const outDir = join(directory, 'dist', build);
    const options = {
      ...parsed.options,
      module: build === 'esm' ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
      outDir,
    };
    const program = ts.createProgram(parsed.fileNames, options);
    checkDiagnostics(ts.getPreEmitDiagnostics(program));
    rmSync(outDir, { recursive: true, force: true });
    const transform = esmSpecifiers(options);
    const result = program.emit(
      undefined,
      undefined,
      undefined,
      undefined,
      build === 'esm' ? { before: [transform], afterDeclarations: [transform] } : undefined,
    );
    checkDiagnostics(result.diagnostics);
    assert.ok(!result.emitSkipped, `${name}: ${build} emit skipped`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'package.json'),
      JSON.stringify({ type: build === 'esm' ? 'module' : 'commonjs' }, null, 2) + '\n',
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], 'Usage: node scripts/build-sdk-package.mjs PACKAGE');
  buildSdkPackage(process.argv[2]);
}
