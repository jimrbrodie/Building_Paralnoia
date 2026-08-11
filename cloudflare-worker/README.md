# News "Update Now" button — Worker setup

The News page has an "Update Now" button (`news.html` / `js/main.js`) that
lets any visitor manually kick off the `update-news.yml` GitHub Action. That
action needs write access to this repo, so the trigger can't happen straight
from the browser — it has to go through a small proxy that holds the GitHub
token server-side. `news-trigger.js` in this folder is that proxy, written
for Cloudflare Workers (free tier is enough).

These steps involve a GitHub token, so they need to be done by you directly —
not pasted to anyone else, including here in chat.

## 1. Create a scoped GitHub token

1. GitHub → Settings → Developer settings → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. Resource owner: your account. Repository access: **Only select
   repositories** → `Building_Paralnoia`.
3. Permissions → Repository permissions → **Actions: Read and write**.
   Leave everything else as "No access".
4. Generate, and copy the token somewhere safe — you won't see it again.

## 2. Create the Worker

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Create Worker**. Give it a name, e.g. `paralnoia-news-trigger`.
2. Open the new Worker → **Edit code**, replace the default contents with
   `news-trigger.js` from this folder, and deploy.
3. Worker → **Settings** → **Variables and Secrets**:
   - Add secret `GITHUB_TOKEN` = the token from step 1.
   - Add variable `ALLOWED_ORIGIN` = `https://jimrbrodie.github.io`
     (no trailing slash).
4. Save/deploy. Copy the Worker's URL, shown at the top of the Worker
   overview page — something like
   `https://paralnoia-news-trigger.<your-subdomain>.workers.dev`.

## 3. Wire it into the site

Open `js/main.js` and set:

```js
const NEWS_TRIGGER_WORKER_URL = "https://paralnoia-news-trigger.<your-subdomain>.workers.dev";
```

Commit and push. The button is disabled with an explanatory message until
this is set.

## How it behaves

- One click calls the Worker, which checks the workflow's most recent run
  before dispatching a new one — refuses (with a friendly message) if a run
  started in the last 10 minutes or is still in progress, so the page can't
  be used to spam Actions.
- After a successful trigger, the page polls the Worker every 5 seconds for
  up to 3 minutes and reloads automatically once the run completes.
