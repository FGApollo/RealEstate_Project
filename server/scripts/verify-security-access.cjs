// Read-only post-migration check: no table records or private documents fetched.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const axios = require('axios');
const https = require('node:https');
const agent = new https.Agent({ keepAlive: false, maxSockets: 4 });
const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, 'server/.env'), quiet: true });
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const configuredUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const tables = ['agent_user_funnel', 'crm_notes', 'favorites', 'identity_verifications', 'lifestyle_tags',
  'messages', 'phone_otps', 'properties', 'property_features', 'property_images', 'property_leads',
  'property_links', 'property_report_appeals', 'property_reports', 'property_review_helpful_votes',
  'property_review_images', 'property_reviews', 'property_view_events', 'seller_subscriptions',
  'swipe_actions', 'trust_score_logs', 'users'];

(async () => {
  if (!publicKey || !configuredUrl || publicKey.startsWith('sb_secret_')) throw new Error('A public Supabase key and URL are required');
  if (publicKey.split('.').length === 3) {
    const claims = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString());
    if (claims.role !== 'anon') throw new Error('This check requires an anon/public key, never a service key');
  }
  const origin = new URL(configuredUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new Error('Invalid Supabase origin');
  const request = (pathname, method) => axios({
    url: new URL(pathname, origin).href, method, headers: { apikey: publicKey },
    maxRedirects: 0, timeout: 10000, signal: AbortSignal.timeout(10000), httpsAgent: agent, maxContentLength: 16384,
    responseType: 'text', validateStatus: () => true
  });
  // Confirm the public key is recognized; an invalid key's 401 must not count
  // as proof that table grants have been fixed. This returns public auth settings.
  const keyCheck = await request('/auth/v1/settings', 'GET');
  if (keyCheck.status !== 200) throw new Error('Public key could not be verified; table results would be inconclusive');
  const results = [];
  for (let index = 0; index < tables.length; index += 4) {
    results.push(...await Promise.all(tables.slice(index, index + 4).map(async (table) => {
      try {
        const response = await request(`/rest/v1/${table}?select=*&limit=0`, 'HEAD');
        return { table, status: response.status, denied: [401, 403].includes(response.status) };
      } catch {
        return { table, status: null, denied: false, error: 'Network check inconclusive' };
      }
    })));
  }
  const report = { checkedAt: new Date().toISOString(), method: 'Verified public key; anonymous HEAD only; no application rows/documents read', allDenied: results.every((row) => row.denied), results };
  const out = path.join(projectRoot, '.local/security-review');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'post-migration-access.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.allDenied ? 0 : 1;
})().catch(() => { console.error('Read-only security verification could not complete. Check network access and public Supabase configuration.'); process.exitCode = 1; })
  .finally(() => agent.destroy());
