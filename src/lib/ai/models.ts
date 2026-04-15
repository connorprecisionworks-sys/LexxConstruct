export const MODELS = {
  fast:    "gpt-5.4-mini",
  premium: "gpt-5.4",
} as const;

export type ModelTier = keyof typeof MODELS;
