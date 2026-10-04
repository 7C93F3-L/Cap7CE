export const searchFontWeights = ["thin", "regular", "medium", "bold", "black"] as const;
export type SearchFontWeight = typeof searchFontWeights[number];

export const searchFontStyles = ["normal", "italic"] as const;
export type SearchFontStyle = typeof searchFontStyles[number];

export const searchFontCharacterSets = ["latin", "chinese"] as const;
export type SearchFontCharacterSet = typeof searchFontCharacterSets[number];

export const searchFontKinds = ["static", "variable"] as const;
export type SearchFontKind = typeof searchFontKinds[number];

export const hasFontSearchFacets = (search: {
  fontWeights?: readonly unknown[];
  fontStyles?: readonly unknown[];
  fontCharacterSets?: readonly unknown[];
  fontKinds?: readonly unknown[];
}) => Boolean(search.fontWeights?.length || search.fontStyles?.length || search.fontCharacterSets?.length || search.fontKinds?.length);

export const matchesFontWeight = (weight: number, value: SearchFontWeight) => {
  if (value === "thin") return weight < 350;
  if (value === "regular") return weight >= 350 && weight < 450;
  if (value === "medium") return weight >= 450 && weight < 600;
  if (value === "bold") return weight >= 600 && weight < 800;
  return weight >= 800;
};
