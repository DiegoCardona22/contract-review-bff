import { Module } from "@nestjs/common";
import { loadConfig, type AppConfig } from "../config.js";
import { ResilientClient } from "../http/resilient-client.js";
import { AnalysisClient, DocumentsClient, UsersClient } from "../upstream/clients.js";
import { ContractComposer } from "./contract-composer.js";
import { ContractsController } from "./contracts.controller.js";

export const APP_CONFIG = Symbol("APP_CONFIG");
export const UPSTREAM_HTTP = Symbol("UPSTREAM_HTTP");

/**
 * Upstream transports are exposed as their own provider so the health module
 * can read circuit state without reaching through the composer. Keeping them
 * addressable also means a test can swap one client without rebuilding the
 * whole graph.
 */
export interface UpstreamHttp {
  documents: ResilientClient;
  users: ResilientClient;
  analysis: ResilientClient;
}

@Module({
  controllers: [ContractsController],
  providers: [
    {
      provide: APP_CONFIG,
      // Parsed once at boot: a bad env crashes startup, not the first request.
      useFactory: (): AppConfig => loadConfig(),
    },
    {
      provide: UPSTREAM_HTTP,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): UpstreamHttp => {
        const build = (name: keyof AppConfig["upstreams"]) =>
          new ResilientClient({
            name,
            baseUrl: config.upstreams[name].baseUrl,
            timeoutMs: config.upstreams[name].timeoutMs,
            retry: { ...config.retry },
          });

        return {
          documents: build("documents"),
          users: build("users"),
          analysis: build("analysis"),
        };
      },
    },
    {
      provide: ContractComposer,
      inject: [UPSTREAM_HTTP],
      useFactory: (http: UpstreamHttp) =>
        new ContractComposer({
          documents: new DocumentsClient(http.documents),
          users: new UsersClient(http.users),
          analysis: new AnalysisClient(http.analysis),
        }),
    },
  ],
  exports: [UPSTREAM_HTTP],
})
export class ContractsModule {}
