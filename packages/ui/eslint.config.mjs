import nextJsConfig from '@ais-chat/eslint-config/nextjs';

// Not a routed Next.js app (component library), so there is no pages/app directory to detect.
const eslintConfig = [...nextJsConfig, { rules: { '@next/next/no-html-link-for-pages': 'off' } }];

export default eslintConfig;
