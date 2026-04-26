// Pattern signatures we use to detect Cloudflare / "are you a robot" walls
// and login walls even when the upstream provider gave us a 200 response.
// Used by both `score.ts` (penalises blocked-looking results) and the
// `fetch-provider` (decides when to fall through to the next UA / next
// provider despite a 200 status).

const BOT_WALL_PATTERNS: Array<RegExp> = [
	/cf-browser-verification/i,
	/Cloudflare\s+Ray\s+ID/i,
	/Just a moment\.\.\.\s*<\/title>/i,
	/__cf_chl_/i,
	/Please verify you are a human/i,
	/Checking your browser before/i,
	/Access denied\s*\|/i,
	/Are you a robot\?/i,
]

const LOGIN_WALL_PATTERNS: Array<RegExp> = [
	/<title>[^<]*Sign\s*in[^<]*<\/title>/i,
	/<title>[^<]*Log\s*in[^<]*<\/title>/i,
	/<title>[^<]*Anmelden[^<]*<\/title>/i,
]

// Cap the slice we test so a 5 MB page doesn't run all regexes against the
// whole document. Bot/login walls always show up in the head + first few
// kilobytes of body.
const TEST_WINDOW = 16_384

export function looksLikeBlocked(html: string): boolean {
	const head = html.slice(0, TEST_WINDOW)
	if (BOT_WALL_PATTERNS.some(re => re.test(head))) return true
	if (LOGIN_WALL_PATTERNS.some(re => re.test(head))) return true
	return false
}
