Turbo Bot V18 — Website Team + Branding Sync

This fixes the website Admin error "تعذر إضافة الشخص".

Added API routes required by the current Turbo website:
- POST /api/admin/team-members
- DELETE /api/admin/team-members/:id

Added persistent database fields:
- teamMembers[]
- settings.logoImage
- settings.cityBackground

/api/public now returns:
- teamMembers
- logoImage
- cityBackground

Existing PostgreSQL/local databases are upgraded in memory automatically; no manual reset is required.

IMPORTANT:
The website points to the Railway bot API:
https://botsturbo-production.up.railway.app

Deploy THIS bot version to Railway. Updating only GitHub Pages is not enough because GitHub Pages cannot provide these API routes.
