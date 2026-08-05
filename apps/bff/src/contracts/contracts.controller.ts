import { Controller, Get, Header, NotFoundException, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ContractComposer } from "./contract-composer.js";

/**
 * Endpoints are shaped around screens, not entities. `/overview` exists because
 * a screen needs exactly that payload — it is not a REST resource and does not
 * pretend to be. That is the defining property of a BFF: the client team owns
 * the contract, so it can change as fast as the UI does.
 */
@Controller("api/contracts")
export class ContractsController {
  constructor(private readonly composer: ContractComposer) {}

  @Get()
  async list(@Req() req: FastifyRequest) {
    return { data: await this.composer.listContracts(String(req.id)) };
  }

  /**
   * Returns 200 with `degraded[]` populated when an optional upstream is
   * unavailable, and 404 only when the contract genuinely does not exist.
   *
   * `no-store` because the degraded variant must never be cached — a CDN
   * holding a response that says "risk unavailable" would keep serving it long
   * after the analysis service recovered.
   */
  @Get(":id/overview")
  @Header("Cache-Control", "no-store")
  async overview(@Param("id") id: string, @Req() req: FastifyRequest) {
    const overview = await this.composer.getOverview(id, String(req.id));

    if (!overview) {
      throw new NotFoundException({ error: "not_found", message: `No contract ${id}` });
    }
    return overview;
  }
}
