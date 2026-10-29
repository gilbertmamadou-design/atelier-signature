// Construit pc/shared/vendor/prosemirror.min.js (window.PM) à partir des sources officielles taguées de ProseMirror
// (MIT, Marijn Haverbeke), quand le registre npm n'est pas joignable. Utilisé par Texte (et plus tard Tableur).
//   S=<dossier des clones> ; pour chaque dépôt : git clone --depth 1 -b <tag> https://github.com/<dépôt> $S/<nom>
//     ProseMirror/prosemirror-model 1.25.4      ProseMirror/prosemirror-state 1.4.4       ProseMirror/prosemirror-transform 1.12.0
//     ProseMirror/prosemirror-view 1.41.7       ProseMirror/prosemirror-commands 1.7.1    ProseMirror/prosemirror-keymap 1.2.3
//     ProseMirror/prosemirror-history 1.5.0     ProseMirror/prosemirror-inputrules 1.5.1  ProseMirror/prosemirror-schema-list 1.5.1
//     ProseMirror/prosemirror-tables v1.8.5     ProseMirror/prosemirror-dropcursor 1.8.2  ProseMirror/prosemirror-gapcursor 1.4.1
//     marijnh/orderedmap 2.1.1                  marijnh/rope-sequence 1.3.4               marijnh/w3c-keyname 2.2.8
//   ESBUILD=<chemin de esbuild/lib/main.js> S=$S node pc/shared/office/tools/prosemirror-build.mjs pc/shared/vendor/prosemirror.min.js
const esbuild = await import(process.env.ESBUILD || 'esbuild');
const S = process.env.S || '/home/claude/pm-src';
const V = {
  'prosemirror-model': '1.25.4', 'prosemirror-state': '1.4.4', 'prosemirror-transform': '1.12.0', 'prosemirror-view': '1.41.7',
  'prosemirror-commands': '1.7.1', 'prosemirror-keymap': '1.2.3', 'prosemirror-history': '1.5.0', 'prosemirror-inputrules': '1.5.1',
  'prosemirror-schema-list': '1.5.1', 'prosemirror-tables': '1.8.5', 'prosemirror-dropcursor': '1.8.2', 'prosemirror-gapcursor': '1.4.1',
  'orderedmap': '2.1.1', 'rope-sequence': '1.3.4', 'w3c-keyname': '2.2.8'
};
const entry = {
  'prosemirror-model': 'src/index.ts', 'prosemirror-state': 'src/index.ts', 'prosemirror-transform': 'src/index.ts', 'prosemirror-view': 'src/index.ts',
  'prosemirror-commands': 'src/commands.ts', 'prosemirror-keymap': 'src/keymap.ts', 'prosemirror-history': 'src/history.ts', 'prosemirror-inputrules': 'src/index.ts',
  'prosemirror-schema-list': 'src/schema-list.ts', 'prosemirror-tables': 'src/index.ts', 'prosemirror-dropcursor': 'src/dropcursor.ts', 'prosemirror-gapcursor': 'src/index.ts',
  'orderedmap': 'index.js', 'rope-sequence': 'index.js', 'w3c-keyname': 'index.js'
};
const alias = {}; for (const k in entry) alias[k] = S + '/' + k + '/' + entry[k];
const src = `
export * as model from 'prosemirror-model'; export * as state from 'prosemirror-state'; export * as transform from 'prosemirror-transform';
export * as view from 'prosemirror-view'; export * as commands from 'prosemirror-commands'; export * as keymap from 'prosemirror-keymap';
export * as history from 'prosemirror-history'; export * as inputrules from 'prosemirror-inputrules'; export * as schemaList from 'prosemirror-schema-list';
export * as tables from 'prosemirror-tables'; export * as dropcursor from 'prosemirror-dropcursor'; export * as gapcursor from 'prosemirror-gapcursor';
export * as keyname from 'w3c-keyname';`;
const css = ['prosemirror-view/style/prosemirror.css', 'prosemirror-gapcursor/style/gapcursor.css', 'prosemirror-tables/style/tables.css'];
const r = await esbuild.build({
  stdin: { contents: src, resolveDir: S, loader: 'js' }, bundle: true, minify: true, format: 'iife', globalName: 'PM', target: 'es2019',
  alias, write: false, ignoreAnnotations: true, tsconfigRaw: { compilerOptions: { target: 'es2019', useDefineForClassFields: false } }, legalComments: 'none', charset: 'utf8', logLevel: 'warning', resolveExtensions: ['.ts', '.js']
});
const fs = await import('fs');
const banner = '/*! ProseMirror (MIT, (C) Marijn Haverbeke and others) | window.PM | construit depuis les tags officiels : ' + Object.keys(V).map((k) => k + ' ' + V[k]).join(', ') + ' ; voir pc/shared/vendor/LICENSES/prosemirror-MIT.txt */\n';
fs.writeFileSync(process.argv[2], banner + r.outputFiles[0].text);
// feuilles de style de base (copiées telles quelles)
const out = css.filter((c) => fs.existsSync(S + '/' + c)).map((c) => '/* ' + c + ' */\n' + fs.readFileSync(S + '/' + c, 'utf8')).join('\n');
fs.writeFileSync(process.argv[2].replace(/\.min\.js$/, '.css'), '/* ProseMirror (MIT) — styles de base des tags ci-dessus */\n' + out);
console.log('ok', r.outputFiles[0].text.length);
