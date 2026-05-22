import { ConfigurationError, ExternalServiceError } from "../../core/errors.js";

function extractText(response) {
  const candidates = response?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    return "";
  }
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts) || !parts.length) {
    return "";
  }
  return parts
    .map((part) => part?.text || "")
    .join("\n")
    .trim();
}

export class GeminiClient {
  constructor({ httpClient, baseUrl, apiKey, model }) {
    this.httpClient = httpClient;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateInsights(prompt) {
    if (!this.apiKey) {
      throw new ConfigurationError("GEMINI_API_KEY is required for AI recommendations");
    }

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 700
      }
    };

    const path = `/v1beta/models/${this.model}:generateContent`;
    // Key in header, not query param — prevents leakage into CloudWatch access logs
    const response = await this.httpClient.postJson(this.baseUrl, path, payload, {}, {
      "x-goog-api-key": this.apiKey
    });
    const text = extractText(response);
    if (!text) {
      throw new ExternalServiceError("Gemini returned an empty response");
    }
    return text;
  }
}

