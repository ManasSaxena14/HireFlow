import 'reflect-metadata';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { z, type ZodType } from 'zod';
import { AppModule } from '../app.module.js';
import { ACCESS_KEY, type AccessPolicy } from '../common/access.js';
import { ZodPipe } from '../common/zod.pipe.js';

type Json = Record<string, unknown>;
type Class = abstract new (...args: never[]) => unknown;

const ROLE_WORDS: Record<string, string> = {
  admin: 'admin',
  recruiter: 'recruiter',
  hiring_manager: 'hiring manager',
  interviewer: 'interviewer',
};

/** Every controller, found by walking the modules from AppModule, in a fixed order. */
function findControllers(): Class[] {
  const seen = new Set<unknown>();
  const controllers: Class[] = [];
  const visit = (entry: unknown) => {
    const module = (entry as { module?: unknown })?.module ?? entry;
    if (typeof module !== 'function' || seen.has(module)) return;
    seen.add(module);
    const extra = typeof entry === 'object' ? (entry as Json) : {};
    for (const child of [
      ...((Reflect.getMetadata('imports', module) as unknown[]) ?? []),
      ...((extra.imports as unknown[]) ?? []),
    ]) {
      visit(child);
    }
    controllers.push(...((Reflect.getMetadata('controllers', module) as Class[]) ?? []));
  };
  visit(AppModule);
  return controllers;
}

const join = (...parts: string[]) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`.replace(/:(\w+)/g, '{$1}');

const schemaOf = (pipes: unknown[] | undefined): ZodType | null => {
  const pipe = pipes?.find((item) => item instanceof ZodPipe) as ZodPipe<ZodType> | undefined;
  return pipe?.schema ?? null;
};

const toJson = (schema: ZodType) => {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Json;
  return json;
};

function describeAccess(policy: AccessPolicy | undefined): string {
  if (!policy || policy.kind === 'user') return 'Signed-in user';
  if (policy.kind === 'public') return 'Anyone';
  return `Company ${policy.roles.map((role) => ROLE_WORDS[role] ?? role).join(', ')}`;
}

/**
 * Builds the OpenAPI document from the code itself: the routes Nest knows, and the zod schemas
 * their pipes check. So the document cannot drift from what the API really accepts.
 * Answers are not described in detail. Their shapes are the types in packages/shared.
 */
export function buildOpenApi(version: string): Json {
  const paths: Record<string, Json> = {};
  for (const controller of findControllers()) {
    const base = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';
    const classPolicy = Reflect.getMetadata(ACCESS_KEY, controller) as AccessPolicy | undefined;
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(prototype).sort()) {
      const handler = prototype[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const route = join('/', base, (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '');
      const policy =
        (Reflect.getMetadata(ACCESS_KEY, handler) as AccessPolicy | undefined) ?? classPolicy;
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<
        string,
        { pipes?: unknown[] }
      >;

      const parameters: Json[] = [...route.matchAll(/\{(\w+)\}/g)].map(([, param]) => ({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
      let requestBody: Json | undefined;
      let hasFile = false;
      for (const [key, arg] of Object.entries(args)) {
        const type = Number(key.split(':')[0]);
        const schema = schemaOf(arg.pipes);
        if (type === RouteParamtypes.FILE) hasFile = true;
        if (type === RouteParamtypes.QUERY && schema) {
          const json = toJson(schema);
          const required = new Set((json.required as string[]) ?? []);
          for (const [param, value] of Object.entries((json.properties as Json) ?? {})) {
            parameters.push({
              name: param,
              in: 'query',
              required: required.has(param),
              schema: value,
            });
          }
        }
        if (type === RouteParamtypes.BODY && schema) requestBody = { schema: toJson(schema) };
      }

      const verb = RequestMethod[method].toLowerCase();
      const status = String(
        (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ??
          (verb === 'post' ? 201 : 200),
      );
      const operation: Json = {
        operationId: `${controller.name.replace(/Controller$/, '')}_${name}`,
        tags: [controller.name.replace(/Controller$/, '')],
        description: `Who: ${describeAccess(policy)}`,
        parameters,
        responses: {
          [status]: { description: status === '204' ? 'Done, with no content' : 'Success' },
          default: {
            description: 'An error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      };
      if (policy?.kind !== 'public') operation.security = [{ bearer: [] }];
      if (hasFile) {
        const fields = (requestBody?.schema as Json | undefined)?.properties ?? {};
        operation.requestBody = {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { ...(fields as Json), resume: { type: 'string', format: 'binary' } },
                required: ['resume'],
              },
            },
          },
        };
      } else if (requestBody) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': requestBody },
        };
      }
      paths[route] = { ...paths[route], [verb]: operation };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'HireFlow API',
      version,
      description:
        'Made from the code by `pnpm --filter @hireflow/api openapi`. Errors always have the shape in `Error`.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'The short-lived token that Neon Auth gives a signed-in browser.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'details', 'requestId'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'array', items: {} },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}
