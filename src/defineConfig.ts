import { TurboWatcher } from './backends/TurboWatcher';
import { type TurbowatchConfigurationInput } from './types';

export const defineConfig = (
  configurationInput: TurbowatchConfigurationInput,
): TurbowatchConfigurationInput => {
  return {
    Watcher: TurboWatcher,
    ...configurationInput,
  };
};
