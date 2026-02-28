type HttpMethod = 'get' | 'post';

type OpenApiPath = Partial<Record<HttpMethod, {
  summary: string;
  security?: Array<Record<string, string[]>>;
  responses: Record<string, { description: string }>;
}>>;

export function buildOpenApiSpec(port: string | number = 3000) {
  const baseUrl = `http://localhost:${port}`;

  const paths: Record<string, OpenApiPath> = {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          '200': { description: 'Service health payload' },
        },
      },
    },
    '/api/openapi.json': {
      get: {
        summary: 'OpenAPI specification',
        responses: {
          '200': { description: 'OpenAPI document' },
        },
      },
    },
    '/api/knowledge/summary': {
      get: {
        summary: 'Knowledge base summary',
        responses: {
          '200': { description: 'Knowledge summary payload' },
        },
      },
    },
    '/api/persistence/health': {
      get: {
        summary: 'Persistence health status',
        responses: {
          '200': { description: 'Persistence health payload' },
        },
      },
    },
    '/api/tasks/trigger': {
      post: {
        summary: 'Queue a task for processing',
        security: [{ bearerAuth: [] }],
        responses: {
          '202': { description: 'Task accepted into queue' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/approvals/pending': {
      get: {
        summary: 'List pending approvals',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Pending approvals payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/approvals/{id}/decision': {
      post: {
        summary: 'Submit approval decision',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Decision accepted' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/dashboard/overview': {
      get: {
        summary: 'Dashboard overview',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Dashboard payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/memory/recall': {
      get: {
        summary: 'Recall per-agent service memory timeline',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Memory recall payload (paginated, redacted by default)' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/knowledge/query': {
      post: {
        summary: 'Query knowledge base',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Knowledge query results' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/knowledge/export': {
      get: {
        summary: 'Export knowledge base',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Knowledge export payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/persistence/historical': {
      get: {
        summary: 'Historical persistence metrics',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Historical data payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/persistence/export': {
      get: {
        summary: 'Export persistence data',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Persistence export payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/webhook/alerts': {
      post: {
        summary: 'Alert ingestion webhook',
        responses: {
          '200': { description: 'Webhook accepted' },
          '401': { description: 'Invalid signature' },
        },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'OpenClaw Orchestrator API',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
        },
      },
    },
    paths,
  };
}
