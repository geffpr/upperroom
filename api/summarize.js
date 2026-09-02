function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée, utilisez POST.' });
      return;
    }

    const rawBody = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(rawBody || '{}');
    } catch (e) {
      sendJson(res, 400, { error: 'Corps de requête JSON invalide.' });
      return;
    }

    const transcript = (parsed.transcript || '').toString().trim();
    if (!transcript) {
      sendJson(res, 400, { error: 'Transcription vide — rien à résumer.' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      sendJson(res, 500, { error: 'ANTHROPIC_API_KEY non configurée sur Vercel.' });
      return;
    }

    const prompt = `Voici la transcription d'une étude biblique en église. Génère un résumé concis (3-4 phrases), une liste de 3 à 5 points clés, et la liste des références bibliques explicitement mentionnées (format "Livre chapitre:verset").

Réponds UNIQUEMENT en JSON valide, sans texte autour, avec ce format exact :
{"summary": "...", "key_points": ["...", "..."], "verses_mentioned": ["..."]}

Transcription :
"""
${transcript}
"""`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Erreur API Anthropic:', anthropicRes.status, errText);
      sendJson(res, 502, { error: 'Erreur en contactant Claude: ' + anthropicRes.status });
      return;
    }

    const anthropicData = await anthropicRes.json();
    const textBlock = (anthropicData.content || []).find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text : '{}';

    let recap;
    try {
      recap = JSON.parse(rawText);
    } catch (e) {
      // Si Claude a répondu avec du texte autour du JSON, on tente d'extraire le bloc JSON
      const match = rawText.match(/\{[\s\S]*\}/);
      recap = match ? JSON.parse(match[0]) : { summary: rawText, key_points: [], verses_mentioned: [] };
    }

    sendJson(res, 200, recap);

  } catch (err) {
    console.error('Erreur génération récap:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
