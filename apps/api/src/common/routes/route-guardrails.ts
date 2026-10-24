import { Injectable, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { listRoutes, routeProblems } from './route-catalog.js';

/** Refuses to start when a route skips the permission or contract rules, instead of shipping an open route. */
@Injectable()
export class RouteGuardrails implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    const problems = routeProblems(listRoutes(this.discovery, this.scanner));
    if (problems.length > 0) {
      throw new Error(`Unsafe routes:\n- ${problems.join('\n- ')}`);
    }
  }
}

@Module({
  imports: [DiscoveryModule],
  providers: [RouteGuardrails],
})
export class RouteGuardrailsModule {}
