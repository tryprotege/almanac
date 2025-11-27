import { Router } from "express";
import { personaRouter } from "./persona/index.js";
import { schemaRouter } from "./schema/index.js";
import { statsRouter } from "./stats/index.js";

const router: Router = Router();

router.use("/", schemaRouter);
router.use("/schema", personaRouter);
router.use("/stats", statsRouter);

export { router };
