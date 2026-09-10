export type FeatureAvailability = "available" | "partial" | "missing";

export type FeatureSpec = {
  key: string;
  label: string;
  group: string;
  availability: FeatureAvailability;
  source: string;
  usableAsFeature: boolean;
  usableAsStake: boolean;
  mayBeInvented: false;
  notes: string;
};

export type SportFeatureContract = {
  sport: string;
  displayName: string;
  independentEngine: true;
  features: FeatureSpec[];
};

export function spec(input: Omit<FeatureSpec, "mayBeInvented" | "usableAsStake"> & { usableAsStake?: boolean }): FeatureSpec {
  return {
    ...input,
    mayBeInvented: false,
    usableAsStake: input.usableAsStake ?? false,
  };
}

export function missing(key: string, label: string, group: string, source: string): FeatureSpec {
  return spec({
    key,
    label,
    group,
    availability: "missing",
    source: "none",
    usableAsFeature: false,
    notes: `Missing. Recommended: ${source}. Do not invent.`,
  });
}

export function contractKeys(c: SportFeatureContract): string[] {
  return c.features.map((f) => f.key);
}

export function missingKeys(c: SportFeatureContract): string[] {
  return c.features.filter((f) => f.availability === "missing").map((f) => f.key);
}

export function usableFeatureKeys(c: SportFeatureContract): string[] {
  return c.features.filter((f) => f.usableAsFeature).map((f) => f.key);
}
