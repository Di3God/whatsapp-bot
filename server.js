// server.js — Microservicio informativo (one-way) para MiTasaTop
// Mantiene una sesión de WhatsApp (Baileys) viva y expone un endpoint
// POST /alerta que postea un mensaje en el grupo GP.
//
// Variables de entorno (configurar en Railway):
//   BOT_TOKEN     -> token secreto para autorizar las llamadas a /alerta
//   GRUPO_GP_JID  -> jid del grupo GP (ej. 120363427871263203@g.us)
//   AUTH_DIR      -> ruta de credenciales de Baileys (default ./auth)
//                    En Railway debe apuntar al volumen montado, ej. /data/auth
//   PORT          -> puerto HTTP (Railway lo inyecta automáticamente)

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import express from 'express';

const BOT_TOKEN    = process.env.BOT_TOKEN    || 'cambia-este-token';
const GRUPO_GP_JID = process.env.GRUPO_GP_JID || '';
const AUTH_DIR     = process.env.AUTH_DIR     || './auth';
const PORT         = process.env.PORT         || 3000;

let sock = null;          // instancia de Baileys
let conectado = false;    // estado de conexión a WA

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n=== Escanea este QR con el WhatsApp del chip del bot ===\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      conectado = true;
      console.log('✅ Conectado a WhatsApp.');
    }

    if (connection === 'close') {
      conectado = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      console.log('Conexión cerrada. Reconectar?', reconnect, '(code:', code, ')');
      if (reconnect) {
        setTimeout(iniciarWhatsApp, 3000); // reintenta tras 3s
      } else {
        console.log('Sesión cerrada (loggedOut). Hay que re-escanear el QR.');
      }
    }
  });
}

// ---- API HTTP ----
const app = express();
app.use(express.json());

// Healthcheck simple
app.get('/', (req, res) => {
  res.json({ ok: true, conectado, grupo: GRUPO_GP_JID ? 'configurado' : 'FALTA_JID' });
});

// Endpoint principal: postea una alerta en el grupo GP
app.post('/alerta', async (req, res) => {
  const { token, texto } = req.body || {};

  if (token !== BOT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'token invalido' });
  }
  if (!texto || typeof texto !== 'string') {
    return res.status(400).json({ ok: false, error: 'falta el campo texto' });
  }
  if (!conectado || !sock) {
    return res.status(503).json({ ok: false, error: 'bot no conectado a WhatsApp' });
  }
  if (!GRUPO_GP_JID) {
    return res.status(500).json({ ok: false, error: 'GRUPO_GP_JID no configurado' });
  }

  try {
    await sock.sendMessage(GRUPO_GP_JID, { text: texto });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando alerta:', err);
    res.status(500).json({ ok: false, error: 'fallo al enviar' });
  }
});

app.listen(PORT, () => {
  console.log(`whatsapp-bot escuchando en puerto ${PORT}`);
});

iniciarWhatsApp();
