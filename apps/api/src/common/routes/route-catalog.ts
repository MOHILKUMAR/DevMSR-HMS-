import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import type { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { IS_PUBLIC, REQUIRED_PERMISSION } from '../../auth/decorators.js';
import { API_CONTRACT, type ApiContractOptions } from '../contract/api-contract.js';
import { IDEMPOTENT } from '../idempotency/idempotent.decorator.js';

export const API_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteInfo {
  /** `AuthController.login` */
  id: string;
  method: HttpMethod;
  /** Full Express path, for example `/api/v1/patients/:id`. */
  path: string;
  /** Success status: `@HttpCode()` or Nest's default (201 for POST, 200 otherwise). */
  status: number;
  isPublic: boolean;
  permission: string | undefined;
  contract: ApiContractOptions | undefined;
  idempotent: boolean;
}

/** The first target (handler, then controller) that carries the metadata wins, as in Nest's Reflector. */
function metadata(key: string, ...targets: object[]): unknown {
  for (const target of targets) {
    const value: unknown = Reflect.getMetadata(key, target);
    if (value !== undefined) return value;
  }
  return undefined;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [typeof value === 'string' ? value : ''];
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment !== '')
    .join('/');
  return `/${joined}`;
}

/** Every HTTP route in the app, with the metadata the pipeline acts on. */
export function listRoutes(discovery: DiscoveryService, scanner: MetadataScanner): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance: unknown = wrapper.instance;
    const metatype = wrapper.metatype;
    if (typeof metatype !== 'function' || typeof instance !== 'object' || instance === null) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const controllerPaths = asList(Reflect.getMetadata(PATH_METADATA, metatype));

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;
      const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      if (methodPath === undefined) continue;

      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod] as HttpMethod;
      const version = (metadata(VERSION_METADATA, handler, metatype) as string | undefined) ?? DEFAULT_API_VERSION;
      for (const controllerPath of controllerPaths) {
        for (const routePath of asList(methodPath)) {
          routes.push({
            id: `${metatype.name}.${name}`,
            method,
            path: joinPath(API_PREFIX, `v${version}`, controllerPath, routePath),
            status: (metadata(HTTP_CODE_METADATA, handler) as number | undefined) ?? (method === 'POST' ? 201 : 200),
            isPublic: metadata(IS_PUBLIC, handler, metatype) === true,
            permission: metadata(REQUIRED_PERMISSION, handler, metatype) as string | undefined,
            contract: metadata(API_CONTRACT, handler) as ApiContractOptions | undefined,
            idempotent: metadata(IDEMPOTENT, handler) === true,
          });
        }
      }
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** Problems that must stop the API from starting. */
export function routeProblems(routes: RouteInfo[]): string[] {
  const problems: string[] = [];
  for (const route of routes) {
    const label = `${route.method} ${route.path} (${route.id})`;
    if (route.isPublic && route.permission !== undefined) {
      problems.push(`${label} has both @Public() and @RequirePermission()`);
    }
    if (!route.isPublic && route.permission === undefined) {
      problems.push(`${label} needs @RequirePermission(...) or a reviewed @Public()`);
    }
    if (route.contract === undefined) {
      problems.push(`${label} needs @ApiContract(...)`);
    }
    if (route.idempotent && (route.isPublic || route.method !== 'POST')) {
      problems.push(`${label} uses @Idempotent() but is not a signed-in POST route`);
    }
  }
  return problems;
}
