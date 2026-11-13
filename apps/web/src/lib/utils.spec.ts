import { describe, expect, it } from "vitest";
import { money } from "./utils";

describe("formatos locales", () => {
  it("formatea importes en lempiras sin alterar su valor", () => {
    const result = money("1750.00");
    expect(result).toContain("1,750.00");
  });
});
