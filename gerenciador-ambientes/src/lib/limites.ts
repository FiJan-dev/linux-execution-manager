//limites aceitos no formulário e validados novamente na API
export const LIMITES = {
  cpu: { min: 0.1, max: 2, passo: 0.1 },
  memoriaMb: { min: 16, max: 3072 },
  ioMbps: { min: 1, max: 500 },
  maxProgramas: 10,
  maxScriptBytes: 1024 * 1024,
} as const;
