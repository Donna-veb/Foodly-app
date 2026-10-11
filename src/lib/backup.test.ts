import { describe, expect, it } from "vitest";
import { validateBackup } from "./backup";

describe("резервная копия", () => {
  it("отклоняет повреждённый файл до записи", () => expect(() => validateBackup({ schemaVersion: 1, groups: [], products: [], periods: [] })).toThrow());
});
