const endpointDocs = [
  { method: 'get', path: '/health', summary: 'Health check', auth: false },
  { method: 'post', path: '/api/auth/register', summary: 'Register user', auth: false, body: { email: 'student@example.com', password: 'student123', name: 'Student User', companyName: 'Student Helpdesk' } },
  { method: 'post', path: '/api/auth/login', summary: 'Login user', auth: false, body: { email: 'admin@demo.com', password: 'admin123' } },
  { method: 'get', path: '/api/auth/me', summary: 'Current authenticated user' },
  { method: 'patch', path: '/api/auth/me', summary: 'Update current authenticated user profile', body: { name: 'Demo User', email: 'admin@demo.com', department: 'Support Operations', avatar: 'data:image/jpeg;base64,...' } },
  { method: 'get', path: '/api/tenants/current', summary: 'Current tenant workspace' },
  { method: 'get', path: '/api/users', summary: 'List users in current tenant' },
  { method: 'post', path: '/api/users', summary: 'Create tenant user', body: { name: 'Support Agent', email: 'agent@example.com', password: 'agent123', role: 'agent' } },
  { method: 'get', path: '/api/dashboard/summary', summary: 'Dashboard metrics' },
  { method: 'get', path: '/api/search', summary: 'Search tickets, customers, and articles', query: { q: 'laptop' } },
  { method: 'post', path: '/api/ai/chat', summary: 'Helpdesk assistant reply', body: { message: 'Which ticket should we handle first?' } },
  { method: 'get', path: '/api/tickets', summary: 'List tickets', query: { q: '' } },
  { method: 'post', path: '/api/tickets', summary: 'Create ticket', body: { title: 'Printer not working', description: 'Office printer shows paper jam.', status: 'open', priority: 'Medium', category: 'Hardware' } },
  { method: 'get', path: '/api/tickets/{id}', summary: 'Get ticket by id', params: { id: '1' } },
  { method: 'put', path: '/api/tickets/{id}', summary: 'Update ticket', params: { id: '1' }, body: { title: 'Updated printer issue', priority: 'High', category: 'Hardware' } },
  { method: 'delete', path: '/api/tickets/{id}', summary: 'Delete ticket', params: { id: '2' } },
  { method: 'get', path: '/api/tickets/{id}/comments', summary: 'List ticket comments', params: { id: '1' } },
  { method: 'post', path: '/api/tickets/{id}/comments', summary: 'Add ticket comment', params: { id: '1' }, body: { body: 'Testing comment from API docs.', internal: false } },
  { method: 'delete', path: '/api/tickets/{ticketId}/comments/{commentId}', summary: 'Delete ticket comment', params: { ticketId: '1', commentId: '1' } },
  { method: 'get', path: '/api/tickets/{id}/attachments', summary: 'List ticket attachments', params: { id: '1' } },
  { method: 'post', path: '/api/tickets/{id}/attachments', summary: 'Upload ticket attachment', params: { id: '1' }, body: { fileName: 'screenshot.png', type: 'image/png', size: 12345, url: 'data:image/png;base64,...' } },
  { method: 'delete', path: '/api/tickets/{ticketId}/attachments/{attachmentId}', summary: 'Delete ticket attachment', params: { ticketId: '1', attachmentId: '1' } },
  { method: 'patch', path: '/api/tickets/{id}/status', summary: 'Change ticket status', params: { id: '1' }, body: { status: 'triage' } },
  { method: 'get', path: '/api/customers', summary: 'List customers' },
  { method: 'post', path: '/api/customers', summary: 'Create customer', body: { name: 'Arta Customer', email: 'arta@example.com', company: 'Acme' } },
  { method: 'get', path: '/api/customers/{id}', summary: 'Get customer by id', params: { id: '1' } },
  { method: 'put', path: '/api/customers/{id}', summary: 'Update customer', params: { id: '1' }, body: { name: 'Arta Customer', email: 'arta@example.com', company: 'Updated Company' } },
  { method: 'delete', path: '/api/customers/{id}', summary: 'Delete customer', params: { id: '2' } },
  { method: 'get', path: '/api/articles', summary: 'List knowledge articles' },
  { method: 'post', path: '/api/articles', summary: 'Create knowledge article', body: { title: 'Reset password', body: 'Open settings and choose reset password.', category: 'Account', published: true } },
  { method: 'put', path: '/api/articles/{id}', summary: 'Update knowledge article', params: { id: '1' }, body: { title: 'Reset password', body: 'Updated steps.', category: 'Account', published: true, global: false } },
  { method: 'delete', path: '/api/articles/{id}', summary: 'Delete knowledge article', params: { id: '1' } },
  { method: 'get', path: '/api/services', summary: 'List services' },
  { method: 'post', path: '/api/services', summary: 'Create service', body: { name: 'Email Support', departmentId: '1' } },
  { method: 'delete', path: '/api/services/{id}', summary: 'Delete service', params: { id: '1' } },
  { method: 'get', path: '/api/jobs', summary: 'List background jobs' },
  { method: 'post', path: '/api/jobs', summary: 'Create background job', body: { type: 'email', payload: { ticketId: '1' } } },
  { method: 'get', path: '/api/histories', summary: 'List ticket history' },
  { method: 'get', path: '/api/notifications', summary: 'List notifications' },
  { method: 'patch', path: '/api/notifications/{id}/read', summary: 'Mark notification as read', params: { id: '1' } },
  { method: 'delete', path: '/api/notifications/{id}', summary: 'Delete notification', params: { id: '1' } },
];

function responseFor(method) {
  if (method === 'post') return { 201: { description: 'Created' } };
  if (method === 'delete') return { 204: { description: 'Deleted' } };
  return { 200: { description: 'OK' } };
}

function buildSwaggerSpec(port = 4000) {
  const paths = {};

  endpointDocs.forEach(({ method, path, summary, auth, params, query, body }) => {
    paths[path] = paths[path] || {};
    paths[path][method] = {
      summary,
      ...(auth === false ? { security: [] } : {}),
      parameters: [
        ...Object.entries(params || {}).map(([name, example]) => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string', example },
        })),
        ...Object.entries(query || {}).map(([name, example]) => ({
          name,
          in: 'query',
          required: false,
          schema: { type: 'string', example },
        })),
      ],
      ...(body ? {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                example: body,
              },
            },
          },
        },
      } : {}),
      responses: responseFor(method),
    };
  });

  return {
    openapi: '3.0.0',
    info: {
      title: 'Helpdesk API',
      version: '1.0.0',
      description: 'Focused documentation with practical endpoints for testing the helpdesk project.',
    },
    servers: [{ url: `http://localhost:${port}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

function swaggerHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Helpdesk API</title>
  <style>
    :root { color-scheme: light; --bg: #f7f7f5; --panel: #fff; --muted: #71717a; --border: #e4e4e7; --text: #18181b; --soft: #f4f4f5; --dark: #18181b; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 13px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 2; display: grid; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); background: rgba(247, 247, 245, .9); backdrop-filter: blur(10px); }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); }
    input, textarea, button { font: inherit; }
    input, textarea { width: 100%; border: 1px solid var(--border); border-radius: 7px; background: #fff; color: var(--text); outline: none; }
    input { height: 34px; padding: 0 10px; }
    textarea { min-height: 120px; padding: 10px; resize: vertical; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
    input:focus, textarea:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,.08); }
    button { height: 34px; border: 1px solid var(--dark); border-radius: 7px; padding: 0 12px; background: var(--dark); color: white; font-weight: 650; cursor: pointer; }
    button.secondary { border-color: var(--border); background: var(--panel); color: var(--text); }
    main { display: grid; gap: 10px; max-width: 1040px; margin: 0 auto; padding: 18px; }
    details { overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
    summary { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px; cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .method { display: inline-grid; height: 23px; place-items: center; border-radius: 6px; color: white; font-size: 11px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
    .get { background: #2563eb; } .post { background: #059669; } .put, .patch { background: #b45309; } .delete { background: #dc2626; }
    .summary-title { display: grid; gap: 2px; min-width: 0; }
    .summary-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    .summary-title code { color: var(--muted); font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
    .try { display: grid; gap: 12px; padding: 0 12px 12px; border-top: 1px solid var(--border); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    label { display: grid; gap: 5px; color: var(--muted); font-weight: 650; }
    .url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    pre { min-height: 76px; max-height: 360px; overflow: auto; margin: 0; border-radius: 8px; padding: 12px; background: #18181b; color: #fafafa; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
    .status { color: var(--muted); font-weight: 700; }
    @media (max-width: 760px) { .grid, .url-row, summary { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div><h1>Helpdesk API</h1><p>41 endpoint-e praktike. Hape endpoint-in, ndrysho fushat dhe kliko Send.</p></div>
  </header>
  <main id="app"></main>
  <script>
    const endpoints = ${JSON.stringify(endpointDocs)};
    const app = document.getElementById('app');
    let apiToken = '';
    async function loginDemo() {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.com', password: 'admin123' }) });
      const data = await res.json();
      apiToken = data.token || '';
      return apiToken;
    }

    function pretty(value) { return JSON.stringify(value, null, 2); }
    function pathWithValues(endpoint, root) {
      let path = endpoint.path;
      Object.keys(endpoint.params || {}).forEach((key) => {
        const value = root.querySelector('[data-param="' + key + '"]').value;
        path = path.replace('{' + key + '}', encodeURIComponent(value));
      });
      const query = new URLSearchParams();
      Object.keys(endpoint.query || {}).forEach((key) => {
        const value = root.querySelector('[data-query="' + key + '"]').value;
        if (value !== '') query.set(key, value);
      });
      return query.toString() ? path + '?' + query.toString() : path;
    }

    app.innerHTML = endpoints.map((endpoint, index) => {
      const params = Object.entries(endpoint.params || {}).map(([key, value]) => '<label>Path ' + key + '<input data-param="' + key + '" value="' + value + '" /></label>').join('');
      const query = Object.entries(endpoint.query || {}).map(([key, value]) => '<label>Query ' + key + '<input data-query="' + key + '" value="' + value + '" /></label>').join('');
      const body = endpoint.body ? '<label>JSON body<textarea data-body>' + pretty(endpoint.body) + '</textarea></label>' : '';
      return '<details data-index="' + index + '">' +
        '<summary><span class="method ' + endpoint.method + '">' + endpoint.method + '</span><span class="summary-title"><strong>' + endpoint.summary + '</strong><code>' + endpoint.path + '</code></span><span class="status" data-status>ready</span></summary>' +
        '<div class="try">' +
          ((params || query) ? '<div class="grid">' + params + query + '</div>' : '') +
          body +
          '<div class="url-row"><input data-url readonly /><button data-send>Send</button></div>' +
          '<pre data-response>{\\n  "result": "response shows here"\\n}</pre>' +
        '</div></details>';
    }).join('');

    document.querySelectorAll('details').forEach((root) => {
      const endpoint = endpoints[Number(root.dataset.index)];
      const url = root.querySelector('[data-url]');
      const status = root.querySelector('[data-status]');
      const responseBox = root.querySelector('[data-response]');
      const updateUrl = () => { url.value = location.origin + pathWithValues(endpoint, root); };
      root.querySelectorAll('input[data-param], input[data-query]').forEach((input) => input.addEventListener('input', updateUrl));
      updateUrl();
      root.querySelector('[data-send]').onclick = async () => {
        status.textContent = 'sending';
        if (endpoint.auth !== false) {
          status.textContent = 'logging in';
          await loginDemo();
        }
        let body;
        const bodyField = root.querySelector('[data-body]');
        if (bodyField && bodyField.value.trim()) {
          try { body = JSON.parse(bodyField.value); }
          catch (error) { status.textContent = 'bad json'; responseBox.textContent = error.message; return; }
        }
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (endpoint.auth !== false && apiToken) headers.Authorization = 'Bearer ' + apiToken;
        try {
          let res = await fetch(pathWithValues(endpoint, root), { method: endpoint.method.toUpperCase(), headers, body: body === undefined ? undefined : JSON.stringify(body) });
          if (res.status === 401 && endpoint.auth !== false) {
            apiToken = '';
            status.textContent = 'logging in';
            headers.Authorization = 'Bearer ' + await loginDemo();
            res = await fetch(pathWithValues(endpoint, root), { method: endpoint.method.toUpperCase(), headers, body: body === undefined ? undefined : JSON.stringify(body) });
          }
          const text = await res.text();
          status.textContent = res.status + ' ' + res.statusText;
          responseBox.textContent = text ? pretty(JSON.parse(text)) : '{ "ok": true }';
        } catch (error) {
          status.textContent = 'error';
          responseBox.textContent = error.message;
        }
      };
    });
  </script>
</body>
</html>`;
}

module.exports = { buildSwaggerSpec, swaggerHtml, endpointDocs };
