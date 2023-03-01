module.exports = {
  ignorePatterns: ['package-lock.json'],
  overrides: [
    {
      extends: ['canonical', 'canonical/node', 'canonical/prettier'],
      files: '*.js',
    },
    {
      extends: ['canonical', 'canonical/typescript', 'canonical/prettier'],
      files: '*.ts',
    },
    {
      extends: ['canonical/json'],
      files: '*.json',
    },
  ],
  root: true,
};
