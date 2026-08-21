import globals from "globals";

import { baseConfig } from "@rfp-os/config/eslint";

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
