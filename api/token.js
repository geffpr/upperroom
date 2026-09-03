function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

// URL du projet LiveKit (pas un secret, dérivée de l'URL WebSocket déjà utilisée côté client)
const LIVEKIT_HTTPS_URL = 'https://upper-room-fux387sl.livekit.cloud';
const FREE_PLAN_PARTICIPANT_LIMIT = 10;

module.exports = async (req, res) => {
  try {
    const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

    // req.query peut ne pas être fourni selon la configuration — on le reconstruit nous-mêmes pour être sûr
    const url = new URL(req.url, 'http://localhost');
    const room = (url.searchParams.get('room') || '').trim();
    const identity = (url.searchParams.get('identity') || '').trim();
    const name = (url.searchParams.get('name') || identity).trim();
    const plan = (url.searchParams.get('plan') || 'free').trim();

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

    // Plafond de participants pour le palier gratuit — vérifié côté serveur, pas juste cosmétique
    if (plan === 'free') {
      try {
        const roomService = new RoomServiceClient(LIVEKIT_HTTPS_URL, apiKey, apiSecret);
        const participants = await roomService.listParticipants(room);
        if (participants.length >= FREE_PLAN_PARTICIPANT_LIMIT) {
          sendJson(res, 429, { error: `Limite de ${FREE_PLAN_PARTICIPANT_LIMIT} participants atteinte (palier gratuit) — passez à Church pour plus de participants.` });
          return;
        }
      } catch (listErr) {
        // La salle n'existe pas encore (personne connecté) : c'est normal, on laisse passer
      }
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
