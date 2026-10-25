import { Global, Module, type DynamicModule } from '@nestjs/common';
import { ENV, type Env } from './env.js';

/** Makes the validated environment injectable everywhere with `@Inject(ENV)`. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
