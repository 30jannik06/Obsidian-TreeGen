import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
	js.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: "./tsconfig.json",
			},
			globals: {
				navigator: "readonly",
				window: "readonly",
				document: "readonly",
				console: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-explicit-any": "warn",
			"no-console": "warn",
		},
	},
	{
		ignores: ["main.js", "node_modules/"],
	},
];
