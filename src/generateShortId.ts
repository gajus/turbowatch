import { randomUUID } from 'crypto';

export const generateShortId = (): string => {
  return randomUUID().split('-')[0];
};
