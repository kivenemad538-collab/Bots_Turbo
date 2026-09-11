Turbo Bot V20 — Job Applications Stable

Fixes:
- Job review Accept/Reject buttons now have real Discord interaction handlers.
- Reject opens a reason modal and DMs the applicant.
- Accept creates the job ticket and only then marks the application accepted.
- If ticket creation fails, the application returns to pending instead of getting stuck.
- Claim ticket button now works and records the staff member.
- Close ticket button now works and deletes the ticket after 3 seconds.
- Repeated Accept clicks cannot create duplicate tickets.
- If the supplied ticket target ID is a category, tickets are created inside it.
- If the supplied target ID is a text channel, ticket creation falls back to server root and posts a link in that channel instead of failing.
- Job submission is rolled back if the Discord review message cannot be posted.
- Old databases are normalized correctly; unreachable database migration code was fixed.
- Stronger validation and explicit API errors added.
