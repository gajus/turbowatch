import { TurboWatcher } from './backends/TurboWatcher';
import {
  type TurbowatchConfiguration,
  type TurbowatchConfigurationInput,
} from './types';

export const defineConfig = (
  configurationInput: TurbowatchConfigurationInput,
): TurbowatchConfiguration => {
  return {
    // as far as I can tell, this is a bug in unicorn/no-unused-properties
    // https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2051
    // eslint-disable-next-line unicorn/no-unused-properties
    debounce: {
      wait: 1_000,
    },

    // eslint-disable-next-line unicorn/no-unused-properties
    Watcher: TurboWatcher,
    ...configurationInput,
  };
};
