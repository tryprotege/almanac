import "dotenv/config";
import { indexRecords } from "../src/services/indexing/indexer.service.js";

const run = async () => {
  await indexRecords();
};

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
