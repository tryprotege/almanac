import { Router } from "express";
import { personaRouter } from "./persona/index.js";
import { schemaRouter } from "./schema/index.js";

const router: Router = Router();

router.use("/", schemaRouter);
router.use("/schema", personaRouter);

export { router };
