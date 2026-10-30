const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild');
module.exports = async (root, output) => {
  const compiled = await build({ stdin: { contents: [
    'export { visualPropertySemanticDefinitions } from "./core/node/resourceCatalog/domain/formats/visualPropertySemantics";',
    'export { searchVisualColors, searchImageColorTraits } from "./core/node/resourceCatalog/domain/formats/imageSearchFilters";',
    'export { searchVideoVisualColors } from "./core/node/resourceCatalog/domain/formats/videoSearchFilters";'
  ].join('\n'), resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', write: false });
  const definitions = { exports: {} }; new Function('module', 'exports', compiled.outputFiles[0].text)(definitions, definitions.exports);
  const { visualPropertySemanticDefinitions, searchVisualColors, searchImageColorTraits, searchVideoVisualColors } = definitions.exports;
  const result = [...searchVisualColors, ...searchImageColorTraits].map(id => {
    const source = visualPropertySemanticDefinitions.find(item => item.semantic === id);
    assert(source?.constraints.length > 0, `${id}: missing active visual semantic`);
    return { id, trait: searchImageColorTraits.includes(id), video: searchVideoVisualColors.includes(id) || searchImageColorTraits.includes(id), constraints: source.constraints };
  });
  fs.writeFileSync(path.join(output, 'filter-visual-semantics.json'), JSON.stringify(result));
};
