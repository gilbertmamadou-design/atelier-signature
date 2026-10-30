// Crochets de chargement Node : « @zos/* » → modules factices (test/zos-factice.mjs), imports sans extension → .js
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@zos/')) return { url: new URL('./zos-factice.mjs?m=' + spec.slice(5), import.meta.url).href, shortCircuit: true }
  if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec)) return next(spec + '.js', ctx)
  return next(spec, ctx)
}
