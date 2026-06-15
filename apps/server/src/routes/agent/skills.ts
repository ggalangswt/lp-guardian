import { Hono } from "hono";
import { lpGuardianByrealSkills } from "../../agent/byrealSkills.js";
import { ok } from "../../http/responses.js";

export function createAgentSkillsRoute(): Hono {
  const route = new Hono();

  route.get("/byreal", (c) => {
    const url = new URL(c.req.url);
    return c.json(
      ok({
        ...lpGuardianByrealSkills,
        baseUrl: url.origin,
        provenance: {
          label: "VERIFIED",
          source: "LP Guardian BE Agent skill manifest",
          degraded: false,
          warnings: [],
          observedAt: Date.now(),
        },
      }),
    );
  });

  return route;
}
