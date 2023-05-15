import { type TurbowatchConfigurationInput } from './types';

export const defineConfig = (
  configurationInput: TurbowatchConfigurationInput,
): TurbowatchConfigurationInput => {
  return {
    ...configurationInput,
  };
};
