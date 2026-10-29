// Construit pc/shared/vendor/hls.min.js (équivalent de la version « full » UMD dist/hls.min.js de hls.js) à partir des
// sources officielles taguées, quand le registre npm n'est pas joignable. Sinon, plus simple : « cd pc && npm ci » puis
// « python3 pc/build-pc.py --vendor » recopie node_modules/hls.js/dist/hls.min.js (même version, voir pc/package.json).
//   git clone --depth 1 -b v1.6.19 https://github.com/video-dev/hls.js           $V/hls-src
//   git clone --depth 1 -b 5.0.1   https://github.com/primus/eventemitter3        $V/ee3
//   git clone --depth 1 -b v2.2.5  https://github.com/tjenkinson/url-toolkit      $V/urltk
//   git clone --depth 1 -b v0.17.1 https://github.com/streaming-video-technology-alliance/common-media-library $V/cml
//   ESBUILD=<chemin de esbuild/lib/main.js> V=<dossier des clones> node pc/hls-build.mjs pc/shared/vendor/hls.min.js
const esbuild = await import(process.env.ESBUILD || 'esbuild');
const V = process.env.V || '/home/claude/video-dev';
const T = v => JSON.stringify(v);
const r = await esbuild.build({
  entryPoints: [V + '/hls-src/src/exports-default.ts'],
  bundle: true, minify: true, format: 'iife', globalName: '__HlsMod', target: 'es2020', tsconfigRaw: { compilerOptions: { target: 'es2020', useDefineForClassFields: false } },
  write: false, legalComments: 'none', charset: 'utf8',
  alias: { 'eventemitter3': V + '/ee3/index.js', 'url-toolkit': V + '/urltk/src/url-toolkit.js', '@svta/common-media-library': V + '/cml/lib/src' },
  resolveExtensions: ['.ts', '.js'],
  define: { __VERSION__: T('1.6.19'), __USE_SUBTITLES__: 'true', __USE_ALT_AUDIO__: 'true', __USE_EME_DRM__: 'true', __USE_CMCD__: 'true',
    __USE_CONTENT_STEERING__: 'true', __USE_VARIABLE_SUBSTITUTION__: 'true', __USE_M2TS_ADVANCED_CODECS__: 'true', __USE_MEDIA_CAPABILITIES__: 'true', __USE_INTERSTITIALS__: 'true' },
  drop: ['console'], logLevel: 'warning'
});
const code = r.outputFiles[0].text;
const banner = '/*! hls.js 1.6.19 | Apache-2.0 | https://github.com/video-dev/hls.js — construit depuis le tag v1.6.19 (commit 1546898) avec eventemitter3 5.0.1 (MIT), url-toolkit 2.2.5 (Apache-2.0), @svta/common-media-library 0.17.1 (Apache-2.0) ; voir pc/shared/vendor/LICENSES/hls.js-Apache-2.0.txt */\n';
const out = banner + '(function __HLS_WORKER_BUNDLE__(__IN_WORKER__){' + code +
  ';var __H=__HlsMod&&__HlsMod.default||__HlsMod;if(!__IN_WORKER__){if(typeof module==="object"&&module.exports)module.exports=__H;else if(typeof window!=="undefined")window.Hls=__H;}})(false);\n';
(await import('fs')).writeFileSync(process.argv[2], out);
console.log('ok', out.length);
