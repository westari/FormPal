// Pulls the exact page-side code that ships out of app/onboarding.tsx (which cannot be loaded in node: it imports React Native), by slicing the source
// text and transpiling only that slice with the TypeScript compiler. Tests run the literal shipped code, never a copy.
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(process.env.ONB_SRC || path.join(ROOT, 'app', 'onboarding.tsx'), 'utf8').split('\r\n').join('\n');

function slice(from, to) {
  const a = SRC.indexOf(from); if (a < 0) throw new Error('not found: ' + from);
  const b = to ? SRC.indexOf(to, a) : SRC.length; if (b < 0) throw new Error('not found: ' + to);
  return SRC.slice(a, b);
}
function run(code, names, scope = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const keys = Object.keys(scope);
  return new Function(...keys, js + '\nreturn {' + names.join(',') + '};')(...keys.map((k) => scope[k]));
}

function load() {
  const { computeGoalPlan } = require('../../lib/onboardingGoals.ts');
  const graph = run(slice('const RESTART_GRAPH_ANIM_JS', 'const DURATION_YEARS'), ['RESTART_GRAPH_ANIM_JS', 'PR_LINE_D', 'PR_LINE_D_DOWN', 'planReadyInject', 'planReadyHeaderText', 'planReadyNoNumber'], { computeGoalPlan });
  const dc = run(slice('const DC_CTA_RE', 'const FIT_BOTH_INJECT'), ['DC_CTA_RE', 'DC_PAGE_INJECT', 'VIEWPORT_JS'], {});
  const hdr = run(slice('const ONB_INPAGE_HEADER_EXCLUDE', '// (round 8) Reports how far the page has scrolled'), ['ONB_INPAGE_HEADER_EXCLUDE', 'onbHeaderJs'], {});
  return { ...graph, ...dc, ...hdr, SRC };
}
module.exports = { load, slice, SRC };
