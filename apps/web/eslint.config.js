import { FlatCompat } from "@eslint/eslintrc";

import { baseConfig } from "@rfp-os/config/eslint";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [...baseConfig, ...compat.extends("next/core-web-vitals")];

export default config;
