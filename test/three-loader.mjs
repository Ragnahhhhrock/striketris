// Lets Node resolve the bare "three" import the same way the browser import map does.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
