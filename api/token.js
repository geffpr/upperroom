function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    const { AccessToken } = require('livekit-server-sdk');

    // req.query peut ne pas être fourni selon la configuration — on le reconstruit nous-mêmes pour être sûr
    const url = new URL(req.url, 'http://localhost');
    const room = (url.searchParams.get('room') || '').trim();
    const identity = (url.searchParams.get('identity') || '').trim();
    const name = (url.searchParams.get('name') || identity).trim();

    if (!room || !identity) {
      sendJson(res, 400, { error: 'Paramètres "room" et "identity" requis.' });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      sendJson(res, 500, { error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET non configurées sur Vercel.' });
      return;
    }

    const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: '4h' });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();
    sendJson(res, 200, { token });

  } catch (err) {
    console.error('Erreur génération token LiveKit:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
