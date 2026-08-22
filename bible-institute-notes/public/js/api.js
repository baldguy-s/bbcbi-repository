// Thin fetch wrapper. Throws on !ok with the server's error message when
// present; callers decide how to surface it. A 401 is treated specially by
// app.js (it triggers the login screen), so we still throw it here rather
// than swallowing it.

async function request(method, path, body, opts = {}) {
  const fetchOpts = {
    method,
    credentials: 'same-origin',
    cache: 'no-store', // API responses change on every mutation — never let the browser HTTP cache serve a stale GET
    headers: {},
  };

  if (body !== undefined && !(body instanceof FormData)) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    fetchOpts.body = body;
  }

  const res = await fetch(path, fetchOpts);

  if (res.status === 401 && !opts.allowUnauthenticated) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
};
