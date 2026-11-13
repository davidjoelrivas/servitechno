import { ConfigService } from "@nestjs/config";
import { OpenAiLlmProvider } from "./openai.provider";
import type { AssistantContext } from "./assistant.types";

const context: AssistantContext = {
  user: {
    sub: "user-1",
    email: "admin@test.local",
    name: "Administrador",
    roles: ["ADMIN"],
    permissions: ["reports.financial.read"],
    sessionVersion: 1,
  },
  timezone: "America/Tegucigalpa",
  now: "2026-11-13T12:00:00.000Z",
  expenseCategories: [],
  paymentMethods: [],
};

describe("OpenAiLlmProvider", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("permanece inactivo y no conecta cuando falta la clave", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const provider = new OpenAiLlmProvider(new ConfigService({}));
    await expect(provider.status()).resolves.toMatchObject({
      provider: "openai",
      configured: false,
      available: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía una solicitud estructurada sin persistencia", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({ intent: "SALES_SUMMARY", period: "TODAY" }),
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      }),
    });
    global.fetch = fetchMock as typeof fetch;
    const provider = new OpenAiLlmProvider(
      new ConfigService({
        OPENAI_API_KEY: "test-secret-key",
        OPENAI_MODEL: "gpt-6-luna",
      }),
    );
    await expect(
      provider.resolve([{ role: "user", content: "¿Cuánto vendimos hoy?" }], context),
    ).resolves.toMatchObject({ intent: "SALES_SUMMARY", period: "TODAY" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(JSON.stringify(body)).not.toContain("test-secret-key");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-secret-key",
    );
  });
});
