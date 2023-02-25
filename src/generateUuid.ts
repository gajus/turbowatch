import {
  randomUUID,
} from 'crypto';

export const generateUuid = (): string => {
  return randomUUID().split('-')[0];
};
