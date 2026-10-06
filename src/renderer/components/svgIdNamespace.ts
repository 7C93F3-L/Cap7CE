export function namespaceSvgIds(svg: string, prefix: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(prefix)) throw new Error("invalid-svg-prefix");
  const ids = new Map<string, string>();
  let result = svg.replace(/(\s)id\s*=\s*(["'])([^"'\s<>]+)\2/g, (_all, space, quote, id) => {
    const name = `${prefix}-${id}`;
    ids.set(id, name);
    return `${space}id=${quote}${name}${quote}`;
  });
  if (!ids.size) return svg;
  result = result.replace(/url\(\s*(["']?)#([^\s)"']+)\1\s*\)/g, (all, quote, id) =>
    ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : all);
  result = result.replace(/(\b(?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g, (all, attribute, quote, id) =>
    ids.has(id) ? `${attribute}${quote}#${ids.get(id)}${quote}` : all);
  return result.replace(/(\baria-(?:labelledby|describedby)\s*=\s*)(["'])([^"']*)\2/g,
    (_all, attribute, quote, value) => `${attribute}${quote}${value.split(/\s+/).map((id: string) => ids.get(id) ?? id).join(" ")}${quote}`);
}
