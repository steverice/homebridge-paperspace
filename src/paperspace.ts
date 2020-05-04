import paperspace from 'paperspace-node';

export type PsApi = (apiKey: string) => paperspace.Endpoints;

const api: Record<string, paperspace.Endpoints> = {};
export const psApi: PsApi = (apiKey: string): paperspace.Endpoints => {
  if (!api[apiKey]) {
    api[apiKey] = paperspace({ apiKey });
  }
  return api[apiKey];
};