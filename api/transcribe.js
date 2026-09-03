function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée, utilisez POST.' });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      sendJson(res, 500, { error: 'GROQ_API_KEY non configurée sur Vercel.' });
      return;
    }

    const contentType = req.headers['content-type'] || 'audio/webm';
    const audioBuffer = await readRawBody(req);

    if (!audioBuffer || audioBuffer.length === 0) {
      sendJson(res, 400, { error: 'Aucune donnée audio reçue.' });
      return;
    }

    // Construit une requête multipart/form-data manuellement pour l'API Groq (compatible OpenAI)
    const boundary = '----upperroom' + Date.now();
    const extension = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : 'webm';

    const prePart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="chunk.${extension}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    const modelPart = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-large-v3-turbo\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `fr\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json\r\n` +
      `--${boundary}--\r\n`
    );

    const body = Buffer.concat([prePart, audioBuffer, modelPart]);

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Erreur API Groq:', groqRes.status, errText);
      sendJson(res, 502, { error: 'Erreur en contactant Groq: ' + groqRes.status });
      return;
    }

    const data = await groqRes.json();
    sendJson(res, 200, { text: (data.text || '').trim() });

  } catch (err) {
    console.error('Erreur transcription:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
