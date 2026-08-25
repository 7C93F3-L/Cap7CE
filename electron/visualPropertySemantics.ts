import type { VisualColorFamily, VisualPropertyVector } from "./visualPropertyTypes";

export type VisualPropertyEvidenceStrength = "strong" | "soft";
export type VisualPropertyMetric =
  | "transparentRatio"
  | "borderTransparentRatio"
  | "brightnessMean"
  | "brightnessMedian"
  | "saturationMean"
  | "lowSaturationRatio"
  | "borderWhiteRatio"
  | "borderBlackRatio"
  | "darkRatio"
  | `colorRatio.${VisualColorFamily}`
  | `colorBlockRatio.${VisualColorFamily}`;

export interface VisualPropertyConstraint {
  metric: VisualPropertyMetric;
  operator: ">" | "<=";
  value: number;
}

export interface VisualPropertySemanticCondition {
  type: "visualProperty";
  semantic: string;
  strength: VisualPropertyEvidenceStrength;
  constraints: VisualPropertyConstraint[];
}

interface VisualPropertySemanticDefinition extends Omit<VisualPropertySemanticCondition, "type"> {
  aliases: readonly string[];
}

const colorDefinition = (
  semantic: string,
  family: VisualColorFamily,
  aliases: readonly string[]
): VisualPropertySemanticDefinition => ({
  semantic,
  strength: "soft",
  aliases,
  constraints: [
    { metric: `colorRatio.${family}`, operator: ">", value: 1500 },
    { metric: `colorBlockRatio.${family}`, operator: ">", value: 500 }
  ]
});

export const visualPropertySemanticDefinitions: readonly VisualPropertySemanticDefinition[] = [
  {
    semantic: "transparent-background",
    strength: "strong",
    aliases: ["透明", "透明背景", "透明底", "无背景"],
    constraints: [{ metric: "borderTransparentRatio", operator: ">", value: 5000 }]
  },
  {
    semantic: "white-background",
    strength: "soft",
    aliases: ["白底", "白色背景", "白背景"],
    constraints: [
      { metric: "transparentRatio", operator: "<=", value: 500 },
      { metric: "borderTransparentRatio", operator: "<=", value: 500 },
      { metric: "borderWhiteRatio", operator: ">", value: 8000 }
    ]
  },
  {
    semantic: "black-background",
    strength: "soft",
    aliases: ["黑底", "黑色背景", "黑背景"],
    constraints: [
      { metric: "transparentRatio", operator: "<=", value: 500 },
      { metric: "borderTransparentRatio", operator: "<=", value: 500 },
      { metric: "borderBlackRatio", operator: ">", value: 8000 }
    ]
  },
  {
    semantic: "dark-image",
    strength: "soft",
    aliases: ["暗色", "暗图", "偏暗", "深色"],
    constraints: [{ metric: "darkRatio", operator: ">", value: 7000 }]
  },
  {
    semantic: "gray-tone",
    strength: "soft",
    aliases: ["灰色", "灰色调"],
    constraints: [
      { metric: "saturationMean", operator: "<=", value: 999 },
      { metric: "lowSaturationRatio", operator: ">", value: 8000 },
      { metric: "borderWhiteRatio", operator: "<=", value: 8000 },
      { metric: "borderBlackRatio", operator: "<=", value: 8000 },
      { metric: "brightnessMean", operator: ">", value: 1200 },
      { metric: "brightnessMean", operator: "<=", value: 8800 },
      { metric: "brightnessMedian", operator: ">", value: 1800 },
      { metric: "brightnessMedian", operator: "<=", value: 8200 }
    ]
  },
  colorDefinition("red", "red", ["红", "红色"]),
  colorDefinition("orange", "orange", ["橙", "橙色"]),
  colorDefinition("yellow", "yellow", ["黄", "黄色"]),
  colorDefinition("green", "green", ["绿", "绿色"]),
  colorDefinition("cyan", "cyan", ["青色"]),
  colorDefinition("blue", "blue", ["蓝", "蓝色"]),
  colorDefinition("purple", "purple", ["紫", "紫色"]),
  colorDefinition("pink", "pink", ["粉", "粉色", "粉红", "粉红色"])
];

const definitionByAlias = new Map(
  visualPropertySemanticDefinitions.flatMap((definition) => (
    definition.aliases.map((alias) => [alias.toLocaleLowerCase(), definition] as const)
  ))
);

export const getVisualPropertySemanticCondition = (term: string): VisualPropertySemanticCondition | null => {
  const definition = definitionByAlias.get(term.toLocaleLowerCase());
  return definition ? {
    type: "visualProperty",
    semantic: definition.semantic,
    strength: definition.strength,
    constraints: definition.constraints.map((constraint) => ({ ...constraint }))
  } : null;
};

const getMetricValue = (properties: VisualPropertyVector, metric: VisualPropertyMetric) => {
  if (metric.startsWith("colorRatio.")) {
    return properties.colorRatios[metric.slice("colorRatio.".length) as VisualColorFamily];
  }
  if (metric.startsWith("colorBlockRatio.")) {
    return properties.colorBlockRatios[metric.slice("colorBlockRatio.".length) as VisualColorFamily];
  }
  const scalarMetric = metric as Exclude<VisualPropertyMetric, `colorRatio.${string}` | `colorBlockRatio.${string}`>;
  return properties[scalarMetric];
};

export const matchesVisualPropertyCondition = (
  properties: VisualPropertyVector | null | undefined,
  condition: VisualPropertySemanticCondition
) => Boolean(properties && condition.constraints.every((constraint) => {
  const value = getMetricValue(properties, constraint.metric);
  return constraint.operator === ">" ? value > constraint.value : value <= constraint.value;
}));
