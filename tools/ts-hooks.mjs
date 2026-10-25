// Node resolve hook: lets node --experimental-strip-types load game modules whose relative
// imports omit the ".ts" extension (Vite-style). Register it before importing game code:
//   import { register } from 'node:module'; register('./ts-hooks.mjs', import.meta.url);
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]s$/.test(specifier)) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
}
