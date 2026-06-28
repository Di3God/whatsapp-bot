// alertas-wa.js — Helper para el CRM MiTasaTop
// Pega al microservicio whatsapp-bot para postear alertas en el grupo GP.
//
// Variables de entorno en el CRM (Railway):
//   WA_BOT_URL    -> URL publica del microservicio, ej. https://whatsapp-bot-production.up.railway.app
//   WA_BOT_TOKEN  -> mismo token que BOT_TOKEN del microservicio

const WA_BOT_URL   = process.env.WA_BOT_URL   || '';
const WA_BOT_TOKEN = process.env.WA_BOT_TOKEN || '';

/**
 * Envía un texto al grupo GP via el microservicio.
 * Falla en SILENCIO: si el bot está caído, no rompe el flujo del CRM.
 */
async function enviarAlertaWA(texto) {
  if (!WA_BOT_URL || !WA_BOT_TOKEN) {
    console.warn('[alertaWA] WA_BOT_URL o WA_BOT_TOKEN no configurados; se omite alerta.');
    return false;
  }
  try {
    const resp = await fetch(`${WA_BOT_URL}/alerta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: WA_BOT_TOKEN, texto })
    });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => '');
      console.warn('[alertaWA] respuesta no OK:', resp.status, detalle);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[alertaWA] error al enviar (se ignora):', err.message);
    return false;
  }
}

// ---- Plantillas de las 4 alertas ----
// Formato WhatsApp: *negrita*, _cursiva_, saltos de linea con \n

function alertaLeadNuevo({ nombre, campania, gestora }) {
  return enviarAlertaWA(
    `🆕 *Nuevo lead*\n` +
    `Cliente: ${nombre}\n` +
    (campania ? `Campaña: ${campania}\n` : '') +
    `Asignado a: *${gestora}*`
  );
}

function alertaVentaCerrada({ gestora, cliente, monto }) {
  return enviarAlertaWA(
    `✅ *Venta cerrada*\n` +
    `*${gestora}* concretó a ${cliente}` +
    (monto ? `\nMonto: ${monto}` : '')
  );
}

function alertaTareaVencida({ gestora, cliente, detalle }) {
  return enviarAlertaWA(
    `⏰ *Tarea vencida*\n` +
    `Gestora: ${gestora}\n` +
    `Lead: ${cliente}\n` +
    (detalle ? `${detalle}` : 'Sin contacto en el plazo esperado.')
  );
}

function alertaRanking(textoRanking) {
  // textoRanking: lo que ya genera construirRankingDia(), formateado para WhatsApp
  return enviarAlertaWA(`📊 *Ranking del día*\n\n${textoRanking}`);
}

export {
  enviarAlertaWA,
  alertaLeadNuevo,
  alertaVentaCerrada,
  alertaTareaVencida,
  alertaRanking
};
