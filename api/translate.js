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

const LANGUAGE_NAMES = { fr: 'français', ht: 'créole haïtien', en: 'anglais', es: 'espagnol' };

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

    const text = (parsed.text || '').toString().trim();
    const targetLang = (parsed.targetLang || '').toString().trim();

    if (!text || !targetLang) {
      sendJson(res, 400, { error: 'Paramètres requis : text, targetLang.' });
      return;
    }

    const targetLanguageName = LANGUAGE_NAMES[targetLang];
    if (!targetLanguageName) {
      sendJson(res, 400, { error: `Langue cible "${targetLang}" non supportée.` });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      sendJson(res, 500, { error: 'ANTHROPIC_API_KEY non configurée sur Vercel.' });
      return;
    }

    const prompt = `Traduis ce texte en ${targetLanguageName}. Réponds UNIQUEMENT avec la traduction, sans aucun commentaire ni guillemets autour.\n\nTexte : "${text}"`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Erreur API Anthropic (traduction):', anthropicRes.status, errText);
      sendJson(res, 502, { error: 'Erreur en contactant Claude: ' + anthropicRes.status });
      return;
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const translated = textBlock ? textBlock.text.trim() : '';

    sendJson(res, 200, { translated, targetLang });

  } catch (err) {
    console.error('Erreur traduction:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
