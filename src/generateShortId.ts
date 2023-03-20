import { randomUUID } from 'node:crypto';

export const generateShortId = (): string => {
  return randomUUID().split('-')[0];
};
