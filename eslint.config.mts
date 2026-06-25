import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-const": "warn",
      "no-useless-assignment": "off",
      "react/react-in-jsx-scope": "off", // Usually disabled in modern React/Next.js
      "react/prop-types": "off", // Often disabled in TS projects
      "react/no-unescaped-entities": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "preserve-caught-error": "off"
    }
  }
]);
