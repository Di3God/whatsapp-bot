# whatsapp-bot — Bot informativo de MiTasaTop

Microservicio **one-way** (solo emite, no responde) que postea alertas del CRM
MiTasaTop en el grupo GP de WhatsApp usando Baileys.

No escucha mensajes entrantes. Expone un único endpoint `POST /alerta`.

---

## Qué hace

El CRM le pega a `POST /alerta {token, texto}` y el bot publica ese texto en el
grupo GP. Cuatro usos previstos:

1. **Lead nuevo + asignación** (event-driven, desde el intake de marketing)
2. **Venta cerrada** (event-driven, cuando un lead pasa a concretado)
3. **Tarea vencida** (cron, según la lógica 3x5)
4. **Ranking** (cron, reutiliza `construirRankingDia()`)

---

## Variables de entorno

| Variable        | Descripción                                                        |
|-----------------|--------------------------------------------------------------------|
| `BOT_TOKEN`     | Token secreto para autorizar llamadas a `/alerta`.                 |
| `GRUPO_GP_JID`  | JID del grupo GP (ej. `120363427871263203@g.us`).                  |
| `AUTH_DIR`      | Carpeta de credenciales de Baileys. En Railway: `/data/auth`.      |
| `PORT`          | Lo inyecta Railway automáticamente.                                |

---

## Despliegue en Railway (pasos)

1. **Sube este repo a GitHub** (ej. `Di3God/whatsapp-bot`).

2. **Crea el proyecto en Railway** apuntando a ese repo. Railway detecta Node y
   corre `npm start`.

3. **Monta un volumen** (clave para no re-escanear el QR en cada redeploy):
   - En el servicio → pestaña **Volumes** → crea un volumen montado en `/data`.
   - Configura la variable `AUTH_DIR = /data/auth`.
   - Así las credenciales de Baileys sobreviven a reinicios y deploys.

4. **Configura las variables de entorno** (`BOT_TOKEN`, `GRUPO_GP_JID`, `AUTH_DIR`).

5. **Primer arranque = escaneo del QR.** En los **logs** de Railway aparecerá el
   QR en ASCII. Escanéalo con el WhatsApp del chip del bot
   (Dispositivos vinculados → Vincular dispositivo). Una vez emparejado, la
   sesión queda en el volumen y no hay que volver a escanear.

6. **Verifica** abriendo la URL pública del servicio (`GET /`):
   debe responder `{ ok: true, conectado: true, grupo: "configurado" }`.

---

## Conectar el CRM

Copia `alertas-wa.js` al CRM. Configura en el CRM:

- `WA_BOT_URL`   = URL pública del microservicio (ej. `https://whatsapp-bot-production.up.railway.app`)
- `WA_BOT_TOKEN` = el mismo valor que `BOT_TOKEN`

Luego enchufa las funciones en los 4 puntos:

```js
import { alertaLeadNuevo, alertaVentaCerrada, alertaTareaVencida, alertaRanking } from './alertas-wa.js';

// 1) Al asignar un lead en el intake de marketing:
alertaLeadNuevo({ nombre: 'Juan Pérez', campania: 'Meta - Q3', gestora: 'Mafer' });

// 2) Al marcar un lead como concretado:
alertaVentaCerrada({ gestora: 'Lourdes', cliente: 'Cliente Z', monto: 'S/ 120,000' });

// 3) En el cron que detecta vencimientos 3x5:
alertaTareaVencida({ gestora: 'Breezy', cliente: 'Lead Y', detalle: 'Día 2 del 3x5 sin contacto' });

// 4) En el cron del ranking (reutiliza construirRankingDia()):
alertaRanking(textoDelRanking);
```

El helper `enviarAlertaWA` **falla en silencio**: si el bot está caído, el CRM
sigue funcionando normal y solo deja un warning en logs.

---

## Prueba rápida del endpoint (curl)

```bash
curl -X POST https://TU-URL.up.railway.app/alerta \
  -H "Content-Type: application/json" \
  -d '{"token":"TU_TOKEN","texto":"Prueba desde curl ✅"}'
```

---

## Notas

- Usa un **chip dedicado** para el bot, nunca el personal ni el comercial.
- Tráfico bajo (pocas alertas al día) + grupo interno = riesgo de baneo bajo.
- Si alguna vez sale `loggedOut` en logs, la sesión murió: borra el contenido de
  `/data/auth` y re-escanea el QR en el siguiente arranque.
