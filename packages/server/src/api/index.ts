import { Router } from "express";
import { configRouter } from "./config/index.js";
import { graphRouter } from "./graph/index.js";
import indexingConfigRouter from "./indexing-config/index.js";
import { personaRouter } from "./persona/index.js";
import { schemaRouter } from "./schema/index.js";
import { statsRouter } from "./stats/index.js";
import oauthRouter from "./oauth/index.js";
import dataSourcesRouter from "./data-sources/index.js";
import presetsRouter from "./presets/index.js";

const router: Router = Router();

router.use("/", schemaRouter);
router.use("/schema", personaRouter);
router.use("/stats", statsRouter);
router.use("/config", configRouter);
router.use("/graph", graphRouter);
router.use("/data-sources", dataSourcesRouter);
router.use("/indexing-config", indexingConfigRouter);
router.use("/oauth", oauthRouter);
router.use("/presets", presetsRouter);

export { router };
