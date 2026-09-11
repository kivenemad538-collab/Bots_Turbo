Turbo Bot V23

Job applications are now controlled per job:
- EMS: open / closed
- Police: open / closed
- Mechanic: open / closed

Mechanic can be opened in one of two scopes:
- ALL mechanic workshops
- ONE selected workshop only

The backend enforces the selected state, so users cannot bypass it by manually calling the API.
Existing ticket claim/close-reason/DM behavior from V22 is preserved.
