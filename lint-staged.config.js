// Runs on files staged for commit. Keep the commands short; anything slow
// (tsc, vitest) belongs in CI.
export default {
	// Code: eslint autofix, then prettier format. Order matters — eslint
	// --fix may reorder imports which prettier then pretties.
	'*.{ts,tsx,js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
	// Non-code: prettier only.
	'*.{json,md,yml,yaml,css,html}': ['prettier --write'],
}
