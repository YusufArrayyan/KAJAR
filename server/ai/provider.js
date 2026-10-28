// LLMProvider abstraction (PRD 9.5). Pick implementations with env vars; never hard-code model names.
//   LLM_PROVIDER=mock|anthropic   LLM_MODEL=<model id>   LLM_FALLBACK_PROVIDER=mock
import { mockProvider } from './mock.js';

const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'topic', 'confidence', 'claims_to_check', 'hint_level_used'],
  properties: {
    reply: { type: 'string' },
    topic: { type: 'string' },
    confidence: { type: 'number' },
    claims_to_check: { type: 'array', items: { type: 'string' } },
    hint_level_used: { type: 'integer' },
  },
};

// Validate model JSON against the contract above (PRD 12.3: model output is schema-checked).
export function validateReply(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) return null;
  const level = Number(obj.hint_level_used);
  const conf = Number(obj.confidence);
  return {
    reply: obj.reply.trim(),
    topic: typeof obj.topic === 'string' ? obj.topic.slice(0, 80) : '',
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
    claims_to_check: Array.isArray(obj.claims_to_check) ? obj.claims_to_check.map(String).slice(0, 8) : [],
    hint_level_used: Number.isInteger(level) && level >= 1 && level <= 4 ? level : 1,
  };
}

function anthropicProvider() {
  let clientPromise;
  const model = process.env.LLM_MODEL;
  const getClient = () =>
    (clientPromise ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => ({ Anthropic, client: new Anthropic() })));

  return {
    name: 'anthropic',
    model,
    async generate({ system, history, maxTokens }) {
      if (!model) throw new Error('LLM_MODEL belum diatur');
      const { Anthropic, client } = await getClient();
      const params = {
        model,
        max_tokens: Math.max(2048, maxTokens * 4),
        system,
        messages: history,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      };
      let response;
      try {
        response = process.env.LLM_SERVER_FALLBACK === '0'
          ? await client.messages.create(params, { timeout: 25_000 })
          : await client.beta.messages.create(
            { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
            { timeout: 25_000 },
          );
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw Object.assign(new Error('rate_limited'), { retryable: true });
        if (err instanceof Anthropic.APIError) throw Object.assign(new Error(`api_${err.status}`), { retryable: (err.status ?? 0) >= 500 });
        throw err;
      }
      if (response.stop_reason === 'refusal') return { refused: true, model_id: response.model };
      if (response.stop_reason === 'max_tokens') throw new Error('max_tokens');
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('json_tidak_valid');
      }
      return {
        out: validateReply(parsed),
        model_id: response.model,
        tokens_in: response.usage?.input_tokens ?? 0,
        tokens_out: response.usage?.output_tokens ?? 0,
      };
    },
    // Lightweight classification and embeddings are not used by the pilot pipeline yet.
    async classify() { return null; },
    async embed() { return null; },
  };
}

const registry = { mock: () => mockProvider, anthropic: anthropicProvider };
const instances = {};

export function getProvider(name = process.env.LLM_PROVIDER || 'mock') {
  if (!registry[name]) throw new Error(`LLM_PROVIDER tidak dikenal: ${name}`);
  return (instances[name] ||= registry[name]());
}

export const getFallbackProvider = () => getProvider(process.env.LLM_FALLBACK_PROVIDER || 'mock');
