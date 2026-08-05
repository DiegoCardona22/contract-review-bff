import { Controller, Get, Inject } from "@nestjs/common";
import { UPSTREAM_HTTP, type UpstreamHttp } from "../contracts/contracts.module.js";

@Controller()
export class HealthController {
  constructor(@Inject(UPSTREAM_HTTP) private readonly http: UpstreamHttp) {}

  @Get("health")
  health() {
    return { status: "ok", service: "bff" };
  }

  /**
   * Circuit state as an endpoint. Cheap to add, and it turns "is the BFF
   * degraded right now?" from a log-grep into one request — the sort of thing
   * you want to have at 3am, not the sort you want to be adding at 3am.
   */
  @Get("internal/circuits")
  circuits() {
    return {
      documents: this.http.documents.getCircuitState(),
      users: this.http.users.getCircuitState(),
      analysis: this.http.analysis.getCircuitState(),
    };
  }
}
