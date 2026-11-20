import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify/types/instance';

const API_NAME = 'AIS.chat';

export async function initSwagger(fastify: FastifyInstance) {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: `${API_NAME} API Documentation`,
        description: `${API_NAME} API Swagger Documentation.`,
        version: '0.1.0',
      },
      servers: [
        {
          url: '/',
          description: API_NAME,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      externalDocs: {
        url: '/',
        description: 'Find more info here',
      },
    },
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      // docExpansion: "none",
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecification: (swaggerObject, req) => {
      // load OpenApi document from relative location to prevent CSP issues
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      swaggerObject.servers[0].url = '/';
      // Derive the API's public base URL from the incoming request.
      // req.protocol and req.hostname are proxy-aware when trustProxy is enabled.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      swaggerObject.externalDocs.url = `${req.protocol}://${req.hostname}`;
      return swaggerObject;
    },
  });
}
