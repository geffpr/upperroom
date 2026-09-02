const { AccessToken } = require('livekit-server-sdk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const room = (req.query.room || '').toString().trim();
  const identity = (req.query.identity || '').toString().trim();
  const name = (req.query.name || identity).toString().trim();

  if (!room || !identity) {
    res.status(400).json({ error: 'Paramètres "room" et "identity" requis.' });
    return;
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET non configurées sur Vercel.' });
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
  res.status(200).json({ token });
};
