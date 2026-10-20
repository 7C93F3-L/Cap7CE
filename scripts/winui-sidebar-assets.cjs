const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
module.exports = (root, output) => {
  const icons = [['logo','logo-cap7ce.svg'],['folder','icon-stable-folder.svg'],['settings','icon-stable-settings.svg']]
    .map(([name,file]) => {
      const svg = fs.readFileSync(path.join(root,'src/renderer/assets/icons',file),'utf8');
      const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
      const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]);
      assert(viewBox.length === 4 && viewBox[0] === 0 && viewBox[1] === 0 && paths.length === 1,
        `${file}: native sidebar expects one monochrome path`);
      return { name, width:viewBox[2], height:viewBox[3], path:paths[0] };
    });
  fs.writeFileSync(path.join(output,'sidebar-icons.json'),JSON.stringify(icons));
};
