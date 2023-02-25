module.exports = {
  ignorePatterns: [
    'package-lock.json',
  ],
  overrides: [
    {
      extends: [
        'canonical',
        'canonical/node',
      ],
      files: '*.js',
    },
    {
      extends: [
        'canonical',
        'canonical/typescript',
      ],
      files: '*.ts',
    },
    {
      extends: [
        'canonical/json',
      ],
      files: '*.json',
    },
  ],
  root: true,
};
