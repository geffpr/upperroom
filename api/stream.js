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

const LIVEKIT_HTTPS_URL = 'https://upper-room-fux387sl.livekit.cloud';

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée, utilisez POST.' });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      sendJson(res, 500, { error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET non configurées sur Vercel.' });
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

    const { EgressClient, StreamOutput, StreamProtocol } = require('livekit-server-sdk');
    const egressClient = new EgressClient(LIVEKIT_HTTPS_URL, apiKey, apiSecret);

    const action = (parsed.action || '').toString();

    if (action === 'start') {
      const room = (parsed.room || '').toString().trim();
      const rtmpUrls = Array.isArray(parsed.rtmpUrls) ? parsed.rtmpUrls.filter(u => typeof u === 'string' && u.trim()) : [];

      if (!room || rtmpUrls.length === 0) {
        sendJson(res, 400, { error: 'Paramètres requis : room, rtmpUrls (tableau non vide).' });
        return;
      }
      if (rtmpUrls.length > 5) {
        sendJson(res, 400, { error: 'Maximum 5 destinations de diffusion à la fois.' });
        return;
      }

      const output = new StreamOutput({ protocol: StreamProtocol.RTMP, urls: rtmpUrls });
      const info = await egressClient.startRoomCompositeEgress(room, output, { layout: 'speaker' });

      sendJson(res, 200, { egressId: info.egressId, status: info.status });
      return;
    }

    if (action === 'stop') {
      const egressId = (parsed.egressId || '').toString().trim();
      if (!egressId) {
        sendJson(res, 400, { error: 'Paramètre requis : egressId.' });
        return;
      }
      const info = await egressClient.stopEgress(egressId);
      sendJson(res, 200, { egressId: info.egressId, status: info.status });
      return;
    }

    if (action === 'status') {
      const room = (parsed.room || '').toString().trim();
      if (!room) {
        sendJson(res, 400, { error: 'Paramètre requis : room.' });
        return;
      }
      const list = await egressClient.listEgress({ roomName: room });
      const active = list.filter(e => e.status === 1 || e.status === 0); // EGRESS_STARTING=0, EGRESS_ACTIVE=1
      sendJson(res, 200, { active: active.map(e => ({ egressId: e.egressId, status: e.status })) });
      return;
    }

    sendJson(res, 400, { error: 'Action inconnue. Utilisez "start", "stop" ou "status".' });

  } catch (err) {
    console.error('Erreur diffusion LiveKit:', err && err.stack ? err.stack : err);
    try {
      sendJson(res, 500, { error: 'Erreur serveur: ' + (err && err.message ? err.message : String(err)) });
    } catch (sendErr) {
      console.error('Impossible même d\'envoyer la réponse d\'erreur:', sendErr);
    }
  }
};
