// Builds the web package the Claude Design converter reads, from the components
// listed in .design-sync/web-entry.ts:
//
//   .design-sync/.cache/web-pkg/
//     package.json        name, module, types
//     dist/index.js       ESM bundle, react-native aliased to react-native-web
//     dist/index.d.ts     re-exports the emitted declaration tree
//     dist/types/**       tsc declarations, @/ and @convex/ aliases made relative
//
// Run from the repo root after the converter deps are staged in .ds-sync/:
//   node .design-sync/build-web.mjs
//
// Why each step exists is recorded in .design-sync/NOTES.md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const NATIVE = join(REPO, 'apps/native');
const ENTRY = join(HERE, 'web-entry.ts');
const PKG_DIR = join(HERE, '.cache/web-pkg');
const DIST = join(PKG_DIR, 'dist');
const TYPES = join(DIST, 'types');

const STAGED = join(REPO, '.ds-sync/package.json');
if (!existsSync(STAGED)) {
  console.error('build-web: stage the converter first (.ds-sync/ with esbuild installed)');
  process.exit(1);
}
const { build } = createRequire(STAGED)('esbuild');
const babel = createRequire(join(NATIVE, 'package.json'))('@babel/core');

// -- plugins ------------------------------------------------------------------

// App source goes through the app's own babel.config.js, as Metro does for web.
// Its react-native-unistyles plugin (root: 'src') swaps react-native primitives
// for unistyles' style-aware components; without it every StyleSheet.create
// style is dropped. The plugin also rewrites reanimated's component files
// (its REPLACE_WITH_UNISTYLES_PATHS), which is what styles Animated.View.
const APP_BABEL_FILTER =
  /([\\/]apps[\\/]native[\\/]src[\\/].*\.[jt]sx?|[\\/]react-native-reanimated[\\/]lib[\\/]module[\\/]component[\\/][^\\/]+\.js)$/;
const appBabel = {
  name: 'app-babel',
  setup(b) {
    b.onLoad({ filter: APP_BABEL_FILTER }, async (args) => {
      const out = await babel.transformAsync(await readFile(args.path, 'utf8'), {
        filename: args.path,
        cwd: NATIVE,
        babelrc: false,
        configFile: join(NATIVE, 'babel.config.js'),
        caller: {
          name: 'metro',
          bundler: 'metro',
          platform: 'web',
          isDev: true,
          isServer: false,
          supportsStaticESM: true,
        },
        sourceMaps: false,
      });
      return { contents: out.code, loader: 'js', resolveDir: dirname(args.path) };
    });
  },
};

const UNISTYLES_NATIVE = join(REPO, 'node_modules/react-native-unistyles/lib/module/components/native');

// Gaps between what the app expects at load and what react-native-web provides.
const webGaps = {
  name: 'rn-web-gaps',
  setup(b) {
    // expo-font's web build imports node:async_hooks for its server-render
    // context; in a browser (window defined) that path is never taken.
    b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'async_hooks', namespace: 'rn-web-gap' }));
    b.onLoad({ filter: /.*/, namespace: 'rn-web-gap' }, () => ({
      contents: 'export class AsyncLocalStorage { getStore() {} run(_s, cb) { return cb(); } }',
      loader: 'js',
    }));
    // The unistyles plugin rewrites imports to components/native/<Name>. Its
    // exports map targets extensionless files, which Metro resolves and esbuild
    // doesn't; point at the browser build (<Name>.js, not <Name>.native.js).
    b.onResolve({ filter: /^react-native-unistyles\/components\/native\/[A-Za-z]+$/ }, (args) => ({
      path: join(UNISTYLES_NATIVE, `${args.path.split('/').pop()}.js`),
    }));
    // expo-symbols imports PlatformColor (Android-only call site); react-native-web
    // doesn't export it, and esbuild rejects the missing named import.
    b.onLoad({ filter: /react-native-web[\\/]dist[\\/]index\.js$/ }, async (args) => ({
      contents: `${await readFile(args.path, 'utf8')}\nexport const PlatformColor = (...names) => names[0];\n`,
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
    // react-native-web injects <style id="react-native-stylesheet"> into <head>.
    // The converter's render check takes the first `#root, [id^="r"]` element as
    // the mount root, finds that style tag (rules go in via insertRule, so its
    // innerHTML is empty), and reports every card as empty. The id is read only
    // through this variable, so renaming it is safe.
    b.onLoad({ filter: /react-native-web[\\/]dist[\\/]exports[\\/]StyleSheet[\\/]dom[\\/]index\.js$/ }, async (args) => ({
      contents: (await readFile(args.path, 'utf8')).replace(
        "var defaultId = 'react-native-stylesheet';",
        "var defaultId = 'stylesheet-react-native';",
      ),
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
    // src/unistyles.ts calls Appearance.setColorScheme at load, which
    // react-native-web doesn't implement. A no-op matches web, where the page
    // can't pin the OS scheme anyway.
    b.onLoad({ filter: /react-native-web[\\/]dist[\\/]exports[\\/]Appearance[\\/]index\.js$/ }, async (args) => ({
      contents: (await readFile(args.path, 'utf8')).replace(
        'export default Appearance;',
        'Appearance.setColorScheme = Appearance.setColorScheme || function () {};\nexport default Appearance;',
      ),
      loader: 'js',
    }));
  },
};

// -- contract drift guard ---------------------------------------------------------

// The converter collapses any type over 240 characters to `unknown`, so the
// icon-name union is hand-written into config.json dtsPropsFor. Fail when it no
// longer matches the names symbol.tsx actually maps.
const symbolSrc = readFileSync(join(NATIVE, 'src/components/symbol.tsx'), 'utf8');
const mapStart = symbolSrc.indexOf('const SF_TO_MATERIAL = {');
const mapBlock = symbolSrc.slice(mapStart, symbolSrc.indexOf('} as const', mapStart));
const iconNames = new Set(
  [...mapBlock.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/gm)].map((m) => m[1] ?? m[2]),
);
const cfg = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
for (const [component, prop] of [
  ['AppSymbolIcon', 'name'],
  ['HeaderIconButton', 'icon'],
]) {
  const body = cfg.dtsPropsFor?.[component] ?? '';
  const segment = new RegExp(`(?:^|;)\\s*${prop}\\??:([^;]*)`).exec(body)?.[1] ?? '';
  const listed = new Set([...segment.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const missing = [...iconNames].filter((n) => !listed.has(n));
  const extra = [...listed].filter((n) => !iconNames.has(n));
  if (!iconNames.size || missing.length || extra.length) {
    console.error(
      `build-web: config.json dtsPropsFor.${component} \`${prop}\` is out of sync with symbol.tsx` +
        (missing.length ? `\n  missing: ${missing.join(', ')}` : '') +
        (extra.length ? `\n  not in symbol.tsx: ${extra.join(', ')}` : '') +
        (iconNames.size ? '' : '\n  (no names parsed from SF_TO_MATERIAL)'),
    );
    process.exit(1);
  }
}

// -- bundle ---------------------------------------------------------------------

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const result = await build({
  entryPoints: [ENTRY],
  outfile: join(DIST, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  absWorkingDir: NATIVE,
  tsconfig: join(NATIVE, 'tsconfig.json'),
  nodePaths: [join(NATIVE, 'node_modules'), join(REPO, 'node_modules')],
  alias: { 'react-native': 'react-native-web' },
  // The converter maps these to the page's window.React / window.ReactDOM.
  external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.otf': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl' },
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
    'process.env.EXPO_OS': '"web"',
    global: 'window',
  },
  // Metro provides a `process` global on web (react-native-worklets and semver
  // read it at load); a plain browser doesn't.
  banner: { js: 'var process = globalThis.process || { env: { NODE_ENV: "development", EXPO_OS: "web" } };' },
  // The unistyles plugin leaves the original react-native import beside its
  // rewrite; esbuild drops the unused one and warns about each.
  logOverride: { 'ignored-bare-import': 'silent' },
  plugins: [appBabel, webGaps],
  metafile: true,
  logLevel: 'warning',
});

const leaked = Object.keys(result.metafile.inputs).filter((p) =>
  /node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(p),
);
if (leaked.length) {
  console.error(`build-web: react internals leaked into the bundle:\n  ${leaked.join('\n  ')}`);
  process.exit(1);
}
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.error(`build-web: dist/index.js ${Math.round(bytes / 1024)} KB`);

// -- declarations -----------------------------------------------------------------

const dtsConfig = join(PKG_DIR, 'tsconfig.dts.json');
writeFileSync(
  dtsConfig,
  `${JSON.stringify(
    {
      extends: join(NATIVE, 'tsconfig.json'),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        skipLibCheck: true,
        rootDir: REPO,
        outDir: TYPES,
      },
      files: [ENTRY, join(NATIVE, 'expo-env.d.ts')],
      include: [],
    },
    null,
    2,
  )}\n`,
);
execFileSync('pnpm', ['exec', 'tsc', '-p', dtsConfig], { cwd: NATIVE, stdio: 'inherit' });

// tsc keeps path aliases verbatim; the converter's type checker can't resolve
// them, so props typed through them would collapse to `any`.
const ALIAS_ROOTS = {
  '@/': join(TYPES, relative(REPO, join(NATIVE, 'src'))),
  '@convex/': join(TYPES, relative(REPO, join(NATIVE, 'convex'))),
};
const SPEC_RX = /(from\s+|import\s*\(\s*|import\s+)(['"])(@\/|@convex\/)([^'"]+)\2/g;
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const unresolved = [];
for (const file of walk(TYPES).filter((f) => f.endsWith('.d.ts'))) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SPEC_RX, (_m, lead, q, alias, rest) => {
    let rel = relative(dirname(file), join(ALIAS_ROOTS[alias], rest)).split(sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${lead}${q}${rel}${q}`;
  });
  if (out !== src) writeFileSync(file, out);
  if (/['"]@(convex)?\//.test(out)) unresolved.push(relative(TYPES, file));
}
if (unresolved.length) {
  console.error(`build-web: aliases left unresolved in:\n  ${unresolved.join('\n  ')}`);
  process.exit(1);
}

const entryTypes = relative(DIST, join(TYPES, relative(REPO, ENTRY))).split(sep).join('/').replace(/\.ts$/, '');
writeFileSync(join(DIST, 'index.d.ts'), `export * from './${entryTypes}';\n`);

// -- manifest ---------------------------------------------------------------------

const nativeVersion = JSON.parse(readFileSync(join(NATIVE, 'package.json'), 'utf8')).version;
writeFileSync(
  join(PKG_DIR, 'package.json'),
  `${JSON.stringify(
    {
      name: '@shelvr/native-ui',
      version: nativeVersion,
      private: true,
      type: 'module',
      main: 'dist/index.js',
      module: 'dist/index.js',
      types: 'dist/index.d.ts',
      sideEffects: true,
    },
    null,
    2,
  )}\n`,
);
console.error(`build-web: wrote ${relative(REPO, PKG_DIR)}`);
