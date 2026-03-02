import OpenAI from "openai";

// Lazy client: initialized on first use so process.env is populated by then
let _client;

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }
  return _client;
}

export default getClient;