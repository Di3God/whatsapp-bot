// server.js — Microservicio informativo (one-way) para MiTasaTop
// Mantiene una sesión de WhatsApp (Baileys) viva y expone un endpoint
// POST /alerta que postea un mensaje en el grupo GP.

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import express from 'express';

const BOT_TOKEN    = process.env.BOT_TOKEN    || 'cambia-este-token';
const GRUPO_GP_JID = process.env.GRUPO_GP_JID || '';
const AUTH_DIR     = process.env.AUTH_DIR     || './auth';
const PORT         = process.env.PORT         || 3000;

let sock = null;
let conectado = false;
let ultimoQR = null;

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      ultimoQR = qr;
      console.log('\n=== Escanea este QR con el WhatsApp del chip del bot ===\n');
      qrcode.generate(qr, { small: true });
      console.log('\n(Si no se ve bien aqui, abre la ruta /qr del servicio en el navegador)\n');
    }

    if (connection === 'open') {
      conectado = true;
      ultimoQR = null;
      console.log('✅ Conectado a WhatsApp.');
    }

    if (connection === 'close') {
      conectado = false;
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code === DisconnectReason.loggedOut) {
        console.log('Sesion cerrada (loggedOut). Borra el volumen /data/auth y reinicia para re-escanear.');
        return;
      }

      console.log('Conexion cerrada. Reintentando en 10s... (code:', code, ')');
      setTimeout(iniciarWhatsApp, 10000);
    }
  });
}

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, conectado, grupo: GRUPO_GP_JID ? 'configurado' : 'FALTA_JID' });
});

app.get('/qr', (req, res) => {
  if (conectado) return res.send('Ya conectado. No hace falta QR.');
  if (!ultimoQR)  return res.send('Aun no hay QR. Recarga en unos segundos.');
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(ultimoQR)}`;
  res.send(`<html><body style="text-align:center;font-family:sans-serif">
    <h3>Escanea con el WhatsApp del chip del bot</h3>
    <img src="${url}" />
    <p>Dispositivos vinculados -> Vincular un dispositivo</p>
  </body></html>`);
});

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
