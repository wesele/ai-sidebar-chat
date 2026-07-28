import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const port = 4178;
const fixture = resolve('tests/e2e/fixtures/editor.html');
let analysisRequests = 0;
const requestLog = [];

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const json = (response, status, value) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
  });
  response.end(JSON.stringify(value));
};

createServer(async (request, response) => {
  requestLog.push(`${request.method} ${request.url}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    response.end();
    return;
  }
  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    try {
      analysisRequests += 1;
      const body = JSON.parse(await readBody(request));
      const content = body.messages[0].content;
      const marker = content.lastIndexOf('REQUEST:\n');
      const prompt = JSON.parse(marker >= 0 ? content.slice(marker + 'REQUEST:\n'.length) : content);
      const result = Array.isArray(prompt.units)
        ? {
            schemaVersion: '1',
            requestId: prompt.requestId,
            documentRevision: prompt.documentRevision,
            units: prompt.units.map((unit) => {
              const issues = [];
              if (unit.unitType === 'sentence') {
                const checkError = (target, replacement, category, reason) => {
                  const idx = unit.text.indexOf(target);
                  if (idx >= 0) {
                    issues.push({
                      scope: 'local',
                      severity: 'problem',
                      start: idx,
                      end: idx + target.length,
                      original: target,
                      replacement,
                      reason,
                      category,
                    });
                  }
                };
                checkError('recieved', 'received', 'spelling', 'Use the correct spelling.');
                checkError('knew', 'know', 'grammar', 'Use "know" instead of "knew" after "don\'t".');
                checkError('schol', 'school', 'spelling', 'Correct spelling to "school".');
                checkError('what is problem', 'what the problem is', 'grammar', 'Correct grammar and word order.');
                checkError('He go to school', 'He went to school', 'grammar', 'Use past tense "went".');
              }
              return {
                unitId: unit.unitId,
                unitRevision: unit.unitRevision,
                issues,
              };
            }),
          }
        : {
            schemaVersion: '1',
            requestId: prompt.requestId,
            documentRevision: prompt.documentRevision,
            severity: 'none',
            summary: 'The document is consistent.',
            suggestions: [],
          };
      json(response, 200, { choices: [{ message: { content: JSON.stringify(result) } }] });
    } catch {
      json(response, 400, { error: 'invalid fake request' });
    }
    return;
  }
  if (request.method === 'GET' && request.url === '/stats') {
    json(response, 200, { analysisRequests, requestLog });
    return;
  }
  if (request.method === 'POST' && request.url === '/reset') {
    analysisRequests = 0;
    requestLog.length = 0;
    json(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && (request.url === '/' || request.url === '/editor.html')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(fixture).pipe(response);
    return;
  }
  response.writeHead(404);
  response.end('not found');
}).listen(port, '127.0.0.1');
