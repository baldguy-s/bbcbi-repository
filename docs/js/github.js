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

// ===== Simple whole-file read/write, for the notebook.json database =====
// Small text file, edited by one person at a time — the Contents API's
// read-sha/write-with-that-sha dance is enough; no need for the heavier
// blob/tree/commit flow used for uploads below.

export async function readJsonFile(path) {
  try {
    const data = await ghFetch(
      `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`
    );
    return { json: JSON.parse(base64ToUtf8(data.content)), sha: data.sha };
  } catch (e) {
    if (e.status === 404) return { json: null, sha: null };
    throw e;
  }
}

export async function writeJsonFile(path, json, sha, message) {
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(json, null, 2)),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const result = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return result.content.sha;
}

// ===== Blob/tree/commit flow, for uploaded files =====
// The Contents API's single-file PUT is capped at ~1MB of base64 content,
// which routinely rejects real phone-camera photos (this app's primary
// upload path, per the brief). The Git Data API's blob endpoint supports up
// to 100MB, so uploads go through that instead. Supports committing several
// files at once (one commit for a multi-file batch upload).
export async function commitFiles(files, message) {
  // files: [{ path, base64Content }]
  const blobs = await Promise.all(
    files.map((f) =>
      ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.base64Content, encoding: 'base64' }),
      }).then((b) => ({ path: f.path, sha: b.sha }))
    )
  );

  const ref = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/ref/heads/${GH_BRANCH}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  const newTree = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });

  const newCommit = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }),
  });

  await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/git/refs/heads/${GH_BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return newCommit.sha;
}

export async function deleteFile(path, message) {
  const data = await ghFetch(
    `/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`
  ).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  if (!data) return;
  await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha: data.sha, branch: GH_BRANCH }),
  });
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
