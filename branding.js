export const BRAND_NAME = 'NEXUS';
export const WEBSITE_URL = 'https://kivenemad538-collab.github.io/Nexus_Website';
export const OWNER_IDS = Object.freeze(['1445069224899907709', '1317806970891272232', '1473659406649528425']);
export const isOwnerId = id => OWNER_IDS.includes(String(id || ''));
export function resolveFrontendUrl(value) {
 const current = String(value || WEBSITE_URL).trim().replace(/\/+$/, '');
 return /^https:\/\/kivenemad538-collab\.github\.io\/legend_Website$/i.test(current) ? WEBSITE_URL : current;
}
