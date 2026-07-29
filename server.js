const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DEFAULT_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

async function saveRecommendation(payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are missing.');
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/roulette_recommendations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${text}`);
  }

  return response.json();
}

function serveIndex(res) {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to load index.html');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getZodiac(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return ['Aries', '양자리'];
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return ['Taurus', '황소자리'];
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return ['Gemini', '쌍둥이자리'];
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return ['Cancer', '게자리'];
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return ['Leo', '사자자리'];
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return ['Virgo', '처녀자리'];
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return ['Libra', '천칭자리'];
  if ((m === 10 && d >= 23) || (m === 11 && d <= 22)) return ['Scorpio', '전갈자리'];
  if ((m === 11 && d >= 23) || (m === 12 && d <= 21)) return ['Sagittarius', '사수자리'];
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return ['Capricorn', '염소자리'];
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return ['Aquarius', '물병자리'];
  return ['Pisces', '물고기자리'];
}

function fallbackRecommendation(date, zodiacKr) {
  const seed = date.getFullYear() + date.getMonth() + date.getDate();
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const numbers = [];
  let state = seed % 2147483647;
  const next = () => (state = (state * 48271) % 2147483647);
  while (numbers.length < 6) {
    const idx = next() % pool.length;
    numbers.push(pool.splice(idx, 1)[0]);
  }
  numbers.sort((a, b) => a - b);
  const bonus = pool[next() % pool.length];
  return {
    numbers,
    bonus,
    explanation: `${zodiacKr}의 상징과 생년월일의 숫자 흐름을 바탕으로 균형형 번호를 추천했습니다. 이 추천은 재미를 위한 해석이며 실제 당첨을 보장하지는 않습니다.`,
  };
}

function normalizeRecommendation(value, fallback) {
  const numbers = Array.isArray(value?.numbers) ? value.numbers : [];
  const cleanNumbers = [...new Set(numbers.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 45))].slice(0, 6).sort((a, b) => a - b);
  const bonus = Number.isInteger(Number(value?.bonus)) ? Number(value.bonus) : fallback.bonus;
  const explanation = typeof value?.explanation === 'string' && value.explanation.trim()
    ? value.explanation.trim()
    : fallback.explanation;
  return {
    numbers: cleanNumbers.length === 6 ? cleanNumbers : fallback.numbers,
    bonus: bonus >= 1 && bonus <= 45 ? bonus : fallback.bonus,
    explanation,
  };
}

function buildPrompt({ birthDate, zodiacKr }) {
  return [
    {
      role: 'system',
      content: 'You are a friendly Korean astrology assistant. Recommend lottery numbers only for entertainment. Do not claim predictive power. Return concise Korean output.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        birthDate,
        zodiacKr,
        task: '생년월일과 별자리를 바탕으로 로또 번호 6개와 보너스 번호 1개를 추천하고, 왜 그 번호를 골랐는지 설명해줘.',
      }),
    },
  ];
}

async function callOpenAI(date, zodiacKr, apiKey) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      input: buildPrompt({ birthDate: date.toISOString().slice(0, 10), zodiacKr }),
      text: {
        format: {
          type: 'json_schema',
          name: 'zodiac_lotto_recommendation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              numbers: {
                type: 'array',
                minItems: 6,
                maxItems: 6,
                items: { type: 'integer', minimum: 1, maximum: 45 },
              },
              bonus: { type: 'integer', minimum: 1, maximum: 45 },
              explanation: { type: 'string' },
            },
            required: ['numbers', 'bonus', 'explanation'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.output_text || '{}');
  return parsed;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    serveIndex(res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/draw') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const date = parseDate(body.birthDate);
        if (!date) {
          sendJson(res, 400, { error: 'birthDate는 YYYY-MM-DD 형식이어야 합니다.' });
          return;
        }

        const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim()
          ? body.apiKey.trim()
          : DEFAULT_API_KEY;

        const [zodiac, zodiacKr] = getZodiac(date);

        if (!apiKey) {
          const fallback = fallbackRecommendation(date, zodiacKr);
          sendJson(res, 200, { ...fallback, zodiac, zodiacKr, mode: 'fallback' });
          return;
        }

        const fallback = fallbackRecommendation(date, zodiacKr);
        const result = await callOpenAI(date, zodiacKr, apiKey);
        const normalized = normalizeRecommendation(result, fallback);
        sendJson(res, 200, { ...normalized, zodiac, zodiacKr, mode: 'openai' });
      } catch (error) {
        sendJson(res, 500, { error: error.message || '서버 오류' });
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/recommendations') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const payload = {
          session_id: typeof body.session_id === 'string' ? body.session_id : null,
          mode_key: typeof body.mode_key === 'string' ? body.mode_key : 'unknown',
          mode_label: typeof body.mode_label === 'string' ? body.mode_label : 'unknown',
          map_name: typeof body.map_name === 'string' ? body.map_name : 'unknown',
          map_rank: Number.isInteger(body.map_rank) ? body.map_rank : null,
          map_tier: typeof body.map_tier === 'string' ? body.map_tier : null,
          source_name: typeof body.source_name === 'string' ? body.source_name : null,
          source_url: typeof body.source_url === 'string' ? body.source_url : null,
          raw_payload: body.raw_payload && typeof body.raw_payload === 'object' ? body.raw_payload : {},
        };
        const inserted = await saveRecommendation(payload);
        sendJson(res, 200, { ok: true, inserted });
      } catch (error) {
        sendJson(res, 500, { error: error.message || 'Failed to save recommendation.' });
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
