// Thin wrapper over the GitHub REST API. This app has no server — a
// Personal Access Token pasted once (stored in localStorage, never sent
// anywhere but api.github.com) is what lets the notebook read/write itself
// as commits to this repo, the same pattern choir-vault and the schedule
// app use.

const PAT_KEY = 'notes_gh_pat';
const GH_OWNER = 'baldguy-s';
const GH_REPO = 'bbcbi-repository';
const GH_BRANCH = 'main';
const API_ROOT = 'https://api.github.com';
// GitHub Pages is configured to serve this site from the /docs folder, so
// every path callers pass into this module is relative to docs/ (matching
// what the served site itself sees, e.g. fetch('data/notebook.json') from
// the page works the same way) — this module alone translates that to the
// real repo-root-relative path GitHub's API needs.
const SITE_ROOT = 'docs';
const repoPath = (sitePath) => `${SITE_ROOT}/${sitePath}`;

export function getPAT() {
  try {
    return localStorage.getItem(PAT_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setPAT(token) {
  try {
    localStorage.setItem(PAT_KEY, token);
  } catch (e) {}
}

export function clearPAT() {
  try {
    localStorage.removeItem(PAT_KEY);
  } catch (e) {}
}

async function ghFetch(path, opts = {}) {
  const token = getPAT();
  const res = await fetch(`${API_ROOT}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch (e) {}
    const err = new Error(`GitHub API ${res.status}: ${detail || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Verifies the token actually works and can write to this repo.
export async function verifyToken() {
  await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}`);
  return true;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ===== Commit chain, tracked ourselves =====
// Everything that writes to the repo — the notebook.json database and
// uploaded files alike — goes through the Git Data API (blobs -> tree ->
// commit -> move the branch ref), and every commit's parent is the SHA
// *we* got back from our own previous commit, not a freshly re-fetched
// "current ref". Re-fetching the ref before each write (or using the
// Contents API's simpler read-sha/write-with-that-sha convenience
// endpoint, which is what this used to do) hits real, observed GitHub
// read-side eventual consistency under a rapid sequence of writes to the
// same file — concretely, a delete immediately following a create could
// be silently dropped because the write that computed its base read a
// not-yet-settled state. Chaining off our own last known-good commit sha
// avoids re-reading GitHub's state entirely for everything after the
// first commit in a session, so there's nothing to be stale.
let chain = null; // { commitSha, treeSha } once primed
let queue = Promise.resolve(); // serializes writes within this page session

async function primeChain() {
  if (chain) return chain;
  const ref = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/ref/heads/${GH_BRANCH}`);
  const commit = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/commits/${ref.object.sha}`);
  chain = { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  return chain;
}

async function commitTreeEntries(entries, message) {
  const run = async () => {
    const base = await primeChain();
    const newTree = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: base.treeSha, tree: entries }),
    });
    const newCommit = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [base.commitSha] }),
    });
    await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/refs/heads/${GH_BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha }),
    });
    chain = { commitSha: newCommit.sha, treeSha: newTree.sha };
    return newCommit.sha;
  };
  // Chain onto the queue so two calls fired close together (e.g. two quick
  // button clicks) commit one after another against the chain we're
  // tracking, instead of both reading the same base and racing to update it.
  const result = queue.then(run);
  queue = result.catch(() => {}); // one failed write shouldn't wedge the queue for later ones
  return result;
}

// ===== notebook.json (the whole-tree database) =====

export async function readJsonFile(path) {
  try {
    const data = await ghFetch(
      `/repos/${GH_OWNER}/${GH_REPO}/contents/${repoPath(path)}?ref=${GH_BRANCH}`
    );
    return { json: JSON.parse(base64ToUtf8(data.content)) };
  } catch (e) {
    if (e.status === 404) return { json: null };
    throw e;
  }
}

export async function writeJsonFile(path, json, message) {
  const blob = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: utf8ToBase64(JSON.stringify(json, null, 2)), encoding: 'base64' }),
  });
  return commitTreeEntries([{ path: repoPath(path), mode: '100644', type: 'blob', sha: blob.sha }], message);
}

// ===== uploaded files =====
// The Contents API's single-file PUT is capped at ~1MB of base64 content,
// which routinely rejects real phone-camera photos (this app's primary
// upload path, per the brief). The Git Data API's blob endpoint supports up
// to 100MB. Supports committing several files at once (one commit for a
// multi-file batch upload).
export async function commitFiles(files, message) {
  // files: [{ path, base64Content }] — path is site-relative (see repoPath)
  const blobs = await Promise.all(
    files.map((f) =>
      ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.base64Content, encoding: 'base64' }),
      }).then((b) => ({ path: repoPath(f.path), sha: b.sha }))
    )
  );
  return commitTreeEntries(
    blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    message
  );
}

export async function deleteFile(path, message) {
  // Deleting a path via the tree API: a tree entry with sha:null removes it.
  return commitTreeEntries([{ path: repoPath(path), mode: '100644', type: 'blob', sha: null }], message);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const REPO_INFO = { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH };
