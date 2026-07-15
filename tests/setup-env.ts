import os from "node:os";
import path from "node:path";

process.env.SOL_PRO_TEST_HOME ||= path.join(os.tmpdir(), `sol-pro-tests-${process.pid}`);
