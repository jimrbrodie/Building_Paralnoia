// Cloudflare Worker — lets visitors on the public News page manually trigger
// the "Update news and satellite data" GitHub Action, without ever exposing
// a GitHub token to the browser.
//
// Required secret (set with `wrangler secret put GITHUB_TOKEN`, or via the
// Cloudflare dashboard under Settings > Variables and Secrets):
//   GITHUB_TOKEN — a fine-grained GitHub PAT scoped ONLY to this repo, with
//                  "Actions: Read and write" permission and nothing else.
//
// Required var (Settings > Variables and Secrets, plain text is fine):
//   ALLOWED_ORIGIN — e.g. "https://jimrbrodie.github.io"
//
// See ../cloudflare-worker/README.md for full setup steps.

const OWNER = "jimrbrodie";
const REPO = "Building_Paralnoia";
const WORKFLOW_FILE = "update-news.yml";
const REF = "master";
const COOLDOWN_MS = 10 * 60 * 1000; // one manual trigger per 10 minutes

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function githubApi(path, token, init = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "paralnoia-news-trigger-worker",
      ...(init.headers || {}),
    },
  });
}

async function latestRun(token) {
  const res = await githubApi(`/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`, token);
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, run: data.workflow_runs?.[0] || null };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env.ALLOWED_ORIGIN);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET" && pathname === "/status") {
      const { ok, run } = await latestRun(env.GITHUB_TOKEN);
      if (!ok) return json({ error: "Failed to check status" }, headers, 502);
      return json({
        latestRun: run
          ? { status: run.status, conclusion: run.conclusion, created_at: run.created_at }
          : null,
      }, headers);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, headers, 405);
    }

    const { ok, run } = await latestRun(env.GITHUB_TOKEN);
    if (!ok) return json({ error: "Failed to check workflow status" }, headers, 502);

    if (run && (run.status === "in_progress" || run.status === "queued")) {
      return json({ error: "An update is already running.", retryAfterSeconds: 30 }, headers, 429);
    }

    if (run) {
      const age = Date.now() - new Date(run.created_at).getTime();
      if (age < COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((COOLDOWN_MS - age) / 1000);
        return json({ error: "News was updated recently — try again shortly.", retryAfterSeconds }, headers, 429);
      }
    }

    const dispatchRes = await githubApi(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, env.GITHUB_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: REF }),
    });

    if (dispatchRes.status !== 204) {
      return json({ error: "Failed to trigger update" }, headers, 502);
    }

    return json({ ok: true }, headers, 202);
  },
};
