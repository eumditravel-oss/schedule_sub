// worker/services/openapiSpec.ts

export const OPENAPI_V1_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'CON-COST Dev Scheduler Generic Integration API',
    version: '1.0.0',
    description:
      'Generic REST Integration API for programmatic project, task group, and task synchronization from external developer tools (Codex, GitHub, Jira, CI/CD).',
    contact: {
      name: 'Dev Scheduler Team',
      email: 'eumditravel@gmail.com',
    },
  },
  servers: [
    {
      url: 'https://concost-dev-scheduler.eumditravel.workers.dev/api/integrations/v1',
      description: 'Production Worker Environment',
    },
    {
      url: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev/api/integrations/v1',
      description: 'QA Staging Environment',
    },
  ],
  security: [
    {
      BearerAuth: [],
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Integration Health Check',
        operationId: 'getIntegrationHealth',
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    version: { type: 'string', example: '1.0.0' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/workers': {
      get: {
        summary: 'List Active Workers',
        operationId: 'getIntegrationWorkers',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Array of workers' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/projects': {
      get: {
        summary: 'List Projects',
        operationId: 'getIntegrationProjects',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Array of projects' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/projects/upsert': {
      post: {
        summary: 'Upsert Project',
        operationId: 'upsertProject',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'start_date', 'end_date'],
                properties: {
                  source: { type: 'string', example: 'codex' },
                  external_id: { type: 'string', example: 'prj-concost-hub' },
                  name: { type: 'string', example: 'CONCOST-HUB Development' },
                  start_date: { type: 'string', format: 'date', example: '2026-08-10' },
                  end_date: { type: 'string', format: 'date', example: '2026-08-31' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Project upserted' },
          '400': { description: 'Bad request' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/task-groups/upsert': {
      post: {
        summary: 'Upsert Task Group',
        operationId: 'upsertTaskGroup',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['group_name'],
                properties: {
                  source: { type: 'string', example: 'codex' },
                  external_id: { type: 'string', example: 'grp-auth' },
                  project_external_id: { type: 'string', example: 'prj-concost-hub' },
                  group_name: { type: 'string', example: 'Authentication Subsystem' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Task group upserted' },
          '400': { description: 'Bad request' },
        },
      },
    },
    '/tasks/upsert': {
      post: {
        summary: 'Upsert Task',
        operationId: 'upsertTask',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['task_name'],
                properties: {
                  source: { type: 'string', example: 'codex' },
                  external_id: { type: 'string', example: 'tsk-login-api' },
                  project_external_id: { type: 'string', example: 'prj-concost-hub' },
                  task_group_external_id: { type: 'string', example: 'grp-auth' },
                  task_name: { type: 'string', example: 'Login API Development' },
                  start_date: { type: 'string', format: 'date', example: '2026-08-10' },
                  end_date: { type: 'string', format: 'date', example: '2026-08-15' },
                  assignees: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        worker_id: { type: 'string', example: 'wrk_03' },
                        allocation_percent: { type: 'number', example: 50 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Task upserted' },
          '409': { description: 'Cross-project conflict warning' },
        },
      },
    },
    '/tasks/batch-upsert': {
      post: {
        summary: 'Batch Upsert Tasks (Max 100)',
        operationId: 'batchUpsertTasks',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Batch processing result' },
        },
      },
    },
    '/entity-links': {
      get: {
        summary: 'Lookup External to Internal Entity Links',
        operationId: 'getEntityLinks',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Array of entity links' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API_KEY',
      },
    },
  },
};
