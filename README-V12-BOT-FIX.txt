Turbo RP Bot V12 compatibility fix
==================================
Manager Discord User ID: 1445069224899907709

This bot backend now matches Turbo Website V12 and supports:
- Manager-only panel admin management by Discord User ID
- Application actions: pre-accept, reject, voice review, voice pass, voice reject, permanent ban, reset
- Discord DM notifications for application and voice-stage decisions
- Permanent application bans and 12-hour rejection cooldown
- New admin state fields used by the V12 website

Railway environment variables required:
DISCORD_BOT_TOKEN
DISCORD_CLIENT_SECRET
SESSION_SECRET
FRONTEND_URL

Recommended:
FRONTEND_URL=https://kivenemad538-collab.github.io
(or use the exact origin shown in your browser if different)

If you use password login for the admin panel:
ADMIN_PANEL_PASSWORD=your-password

Important:
The bot must be online and show "Discord bot ready as ..." in Railway logs for DMs and role changes to work.
Users can block Discord DMs; in that case the website action still succeeds but Railway logs will show "DM failed".
