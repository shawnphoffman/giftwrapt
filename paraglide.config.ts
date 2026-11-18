// Paraglide (i18n) compiler options, shared by vite.config.ts, vitest.config.ts
// and .storybook/main.ts so every tool compiles the same typed message
// functions from messages/*.json into src/paraglide (generated, gitignored).
import { LOCALE_STRATEGY } from './src/lib/i18n/strategy.ts'

export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/paraglide',
	outputStructure: 'message-modules' as const,
	emitTsDeclarations: true,
	// One custom strategy does all the work (see src/lib/i18n/strategy.ts);
	// the base locale is the fallback for code that runs with neither a
	// request nor a document: tests, Storybook, scripts, cron.
	strategy: [LOCALE_STRATEGY, 'baseLocale'] as Array<`custom-${string}` | 'baseLocale'>,
}
