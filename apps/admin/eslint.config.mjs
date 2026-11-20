import nextJsConfig from '@ais-chat/eslint-config/nextjs';

const eslintConfig = [
  ...nextJsConfig,
  {
    rules: {
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
];

export default eslintConfig;
