const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const openAiKey = process.env.OPENAI_API_KEY;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serveFile(res, filePath) {
  const safePath = path.normalize(filePath).replace(/^\.+/, '');
  const absolutePath = path.join(__dirname, safePath);

  if (!absolutePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(absolutePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, aiEnabled: Boolean(openAiKey) }));
    return;
  }

  if (req.url.startsWith('/api/plan')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const input = JSON.parse(body || '{}');
        const plan = await generatePlan(input);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(plan));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  const requestPath = req.url === '/' ? '/index.html' : req.url;
  serveFile(res, `.${requestPath}`);
});

function buildPlannerPrompt(input) {
  const subjects = (input.subjects || '').split(',').map(s => s.trim()).filter(Boolean);
  const days = Number(input.days || 3);
  const focus = input.focus || 'balanced';

  return `You are FocusFlow, a calm study-planning assistant for students. Create a realistic plan for these subjects: ${subjects.join(', ') || 'general study'}. The student has ${days} days to prepare and wants a ${focus} approach. Return valid JSON with this structure: {"summary":"...","plan":[{"subject":"...","day":"Day 1","task":"...","intensity":"..."}]}. Keep the plan practical, encouraging, and easy to follow.`;
}

function buildFallbackPlan(input) {
  const subjects = (input.subjects || '').split(',').map(s => s.trim()).filter(Boolean);
  const days = Number(input.days || 3);
  const focus = input.focus || 'balanced';

  const base = [
    'Review notes and mark the most confusing concepts',
    'Practice a timed set of problems or flashcards',
    'Summarize the topic in your own words and test yourself'
  ];

  const plan = subjects.length ? subjects.map((subject, index) => ({
    subject,
    day: `Day ${((index % days) + 1)}`,
    task: base[index % base.length],
    intensity: focus === 'exam' ? 'High' : focus === 'light' ? 'Low' : 'Medium'
  })) : [
    { subject: 'General study', day: 'Day 1', task: 'Review your notes and set a clear goal for the day', intensity: 'Medium' }
  ];

  return {
    summary: `A ${focus} study plan for ${subjects.length || 1} focus areas over ${days} days.`,
    plan,
    source: 'local-fallback'
  };
}

function parseModelOutput(text) {
  if (!text) return null;
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        return null;
      }
    }
  }
  return null;
}

async function generatePlan(input) {
  if (openAiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: buildPlannerPrompt(input) },
            { role: 'user', content: 'Create the plan now.' }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI request failed');
      }

      const data = await response.json();
      const parsed = parseModelOutput(data?.choices?.[0]?.message?.content || '');
      if (parsed?.summary && Array.isArray(parsed?.plan)) {
        return { ...parsed, source: 'openai' };
      }
    } catch (error) {
      console.error('AI plan fallback triggered', error.message);
    }
  }

  return buildFallbackPlan(input);
}

if (require.main === module) {
  server.listen(port, () => console.log(`Server listening on port ${port}`));
}

module.exports = { server, generatePlan, buildPlannerPrompt, buildFallbackPlan };
