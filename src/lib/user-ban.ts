// One definition of "is this account banned right now", shared by every
// credential guard (web cookie, mobile apiKey, MCP token). better-auth's
// admin plugin only blocks NEW sessions for a banned user; a cookie still
// inside its cookieCache window and a mobile apiKey both keep working unless
// each guard checks the row itself.
//
// A ban with no expiry is permanent; one with an expiry lifts itself once
// `banExpires` has passed, matching better-auth's own sign-in check.
export function isUserBanned(user: { banned: boolean | null; banExpires: Date | null }, now: Date = new Date()): boolean {
	if (!user.banned) return false
	return !user.banExpires || user.banExpires.getTime() > now.getTime()
}
