const resources = [
  'tenants',
  'users',
  'roles',
  'permissions',
  'departments',
  'teams',
  'agent-profiles',
  'customers',
  'services',
  'sla-policies',
  'priorities',
  'categories',
  'tickets',
  'comments',
  'attachments',
  'histories',
  'articles',
  'notifications',
  'audit-logs',
  'ai-conversations',
  'cache-entries',
  'jobs',
];

function buildSwaggerSpec(port = 4000) {
  const paths = {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/api/auth/register': { post: { summary: 'Register user', responses: { 201: { description: 'Created' } } } },
    '/api/auth/login': { post: { summary: 'Login user', responses: { 200: { description: 'Token' } } } },
    '/api/auth/me': { get: { summary: 'Current authenticated user', responses: { 200: { description: 'User profile' }, 401: { description: 'Unauthorized' } } } },
    '/api/tenants/current': { get: { summary: 'Current tenant/company profile', responses: { 200: { description: 'Tenant profile' } } } },
    '/api/dashboard/summary': { get: { summary: 'Tenant dashboard metrics', responses: { 200: { description: 'Summary metrics' } } } },
    '/api/search': { get: { summary: 'Global search and filtering', responses: { 200: { description: 'Results' } } } },
    '/api/ai/chat': { post: { summary: 'OpenAI chatbot endpoint', responses: { 200: { description: 'AI response' } } } },
    '/api/jobs': { post: { summary: 'Create background job', responses: { 202: { description: 'Queued' } } } },
    '/api/tickets/{id}/comments': {
      get: { summary: 'List ticket comments', responses: { 200: { description: 'Comments' }, 404: { description: 'Ticket not found' } } },
      post: { summary: 'Add ticket comment', responses: { 201: { description: 'Created' }, 404: { description: 'Ticket not found' } } },
    },
    '/api/tickets/{id}/status': {
      patch: { summary: 'Change ticket status', responses: { 200: { description: 'Updated' }, 400: { description: 'Invalid status' }, 403: { description: 'Forbidden' } } },
    },
  };

  resources.forEach((resource) => {
    paths[`/api/${resource}`] = {
      get: { summary: `List ${resource}`, responses: { 200: { description: 'List' } } },
      post: { summary: `Create ${resource}`, responses: { 201: { description: 'Created' } } },
    };
    paths[`/api/${resource}/{id}`] = {
      get: { summary: `Get ${resource}`, responses: { 200: { description: 'Item' }, 404: { description: 'Not found' } } },
      put: { summary: `Update ${resource}`, responses: { 200: { description: 'Updated' } } },
      delete: { summary: `Delete ${resource}`, responses: { 204: { description: 'Deleted' } } },
    };
  });

  return {
    openapi: '3.0.0',
    info: {
      title: 'Helpdesk Management System API',
      version: '1.0.0',
      description: 'RESTful API for a multi-tenant helpdesk project.',
    },
    servers: [{ url: `http://localhost:${port}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT-like HMAC token',
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
  <title>Helpdesk Swagger UI</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f7f8fb; color: #18202f; }
    header { background: #0f766e; color: white; padding: 24px 32px; }
    main { padding: 24px 32px; }
    details { background: white; border: 1px solid #d8dee9; border-radius: 8px; margin: 10px 0; padding: 12px 16px; }
    summary { cursor: pointer; font-weight: 700; }
    code { background: #eef2f7; border-radius: 4px; padding: 2px 6px; }
  </style>
</head>
<body>
  <header><h1>Helpdesk API Swagger</h1><p>OpenAPI documentation generated from the Express routes.</p></header>
  <main id="app">Loading...</main>
  <script>
    fetch('/api-docs.json').then(r => r.json()).then(spec => {
      document.getElementById('app').innerHTML = Object.entries(spec.paths).map(([path, methods]) => {
        const rows = Object.entries(methods).map(([method, meta]) => '<p><code>' + method.toUpperCase() + '</code> ' + meta.summary + '</p>').join('');
        return '<details open><summary>' + path + '</summary>' + rows + '</details>';
      }).join('');
    });
  </script>
</body>
</html>`;
}

module.exports = { buildSwaggerSpec, swaggerHtml };
