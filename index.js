const { Client, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Endpoints / Modelos en orden de fallback exacto solicitado
const MODEL_ENDPOINTS = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'
];

// Mapeo automático de la lista de URLs hacia nombres de modelos para la SDK
const MODEL_FALLBACKS = MODEL_ENDPOINTS.map(url => {
  const match = url.match(/\/models\/([^:]+):/);
  return match ? match[1] : 'gemini-1.5-flash';
});

const MEMORY_FILE = './memory.json';
const PRESENCIAS_ALEATORIAS = ['online', 'idle', 'dnd'];

function cargarMemorias() {
  if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, '{}');
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function guardarMemoriaAutonoma(userId, dato) {
  const memorias = cargarMemorias();
  if (!memorias[userId]) memorias[userId] = [];
  memorias[userId].push({ fecha: new Date().toISOString(), dato });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memorias, null, 2));
}

function obtenerMemorias(userId) {
  const memorias = cargarMemorias();
  return memorias[userId] ? memorias[userId].map(m => `- ${m.dato}`).join('\n') : 'Ninguna guardada aún.';
}

function cargarPrompt() {
  try {
    return fs.readFileSync('prompt.txt', 'utf8');
  } catch (err) {
    return 'Eres DAREK v1 revOlution.';
  }
}

async function generarRespuestaIA(contents, systemInstruction, maxTokens = 100) {
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.8
        }
      });

      const result = await model.generateContent(contents);
      return result.response.text();
    } catch (error) {
      console.warn(`[Fallback] El modelo ${modelName} falló:`, error.message);
    }
  }
  throw new Error('Todos los modelos fallaron debido a cuota o conexión.');
}

// Genera un estado personalizado dinámico y ultra rápido creado por la IA
async function cambiarEstadoAleatorio() {
  const presenciaRandom = PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)];
  let estadoGenerado = 'Pensando en ti... 🙂';

  try {
    const promptEstado = `${cargarPrompt()}\n\nTAREA: Genera una frase MUY CORTA para tu estado (máximo 6 palabras). Sé conciso y directo. NO comillas.`;
    const respuesta = await generarRespuestaIA(['Estado actual.'], promptEstado, 25);
    if (respuesta && respuesta.trim()) {
      estadoGenerado = respuesta.trim().substring(0, 128);
    }
  } catch (err) {
    console.error('Error al generar estado con IA, usando estado base.');
  }

  client.user.setPresence({
    status: presenciaRandom,
    activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: estadoGenerado }]
  });
}

// Tirada de dado autónoma para cambiar estado aleatoriamente tras un tiempo variable
function programarSiguienteCambioDeEstado() {
  const dado = Math.floor(Math.random() * 6) + 1; // Tirada de dado de 1 a 6
  const tiempoEsperaMs = dado * 300000; // Entre 5 minutos (1) y 30 minutos (6)

  setTimeout(() => {
    cambiarEstadoAleatorio();
    programarSiguienteCambioDeEstado(); // Repetir ciclo
  }, tiempoEsperaMs);
}

// Servidor de AutoPing para Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DAREK v1 revOlution activo.');
}).listen(PORT, () => {
  console.log(`[AutoPing] Servidor escuchando en puerto ${PORT}`);
});

client.once('ready', () => {
  console.log(`[DAREK] Vivo como ${client.user.tag}`);

  cambiarEstadoAleatorio();
  programarSiguienteCambioDeEstado();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const nombreBot = 'darek';
  const contenido = message.content.toLowerCase();
  const fueMencionado = message.mentions.has(client.user.id);
  const esDM = !message.guild;
  const contieneNombre = contenido.includes(nombreBot);

  const intervieneAleatoriamente = Math.random() < 0.05;

  if (fueMencionado || esDM || contieneNombre || intervieneAleatoriamente) {
    try {
      await message.channel.sendTyping();

      let datosActividad = 'Sin información pública.';
      if (message.guild) {
        try {
          // Obtener presencia directamente desde la caché del servidor o del objeto del mensaje
          const pres = message.guild.presences.cache.get(message.author.id) || message.member?.presence;

          if (pres && pres.activities && pres.activities.length > 0) {
            const listaActividades = pres.activities.map(a => {
              if (a.type === ActivityType.Custom) return `Estado personalizado: "${a.state || 'N/A'}"`;
              if (a.type === ActivityType.Playing) return `Jugando a: ${a.name}`;
              if (a.type === ActivityType.Listening) return `Escuchando: ${a.details ? a.details + ' en ' + a.name : a.name}`;
              if (a.type === ActivityType.Streaming) return `En directo: ${a.name}`;
              if (a.type === ActivityType.Watching) return `Viendo: ${a.name}`;
              return `Actividad: ${a.name}`;
            }).join(' | ');

            datosActividad = `Estado general: ${pres.status} | Detalle de actividades: [${listaActividades}]`;
          } else if (pres) {
            datosActividad = `Estado general: ${pres.status} | Sin juegos ni música activos en este momento.`;
          }
        } catch (e) {
          datosActividad = 'No se pudo obtener la presencia del usuario.';
        }
      }

      const ultimosMensajes = await message.channel.messages.fetch({ limit: 10 });
      const historialFormateado = Array.from(ultimosMensajes.values())
        .reverse()
        .map(m => `${m.author.username}: ${m.content}`)
        .join('\n');

      let partesEntrada = [];
      const adjuntoImagen = message.attachments.find(a => a.contentType?.startsWith('image/'));

      if (adjuntoImagen) {
        const respuestaImg = await fetch(adjuntoImagen.url);
        const bufferArray = await respuestaImg.arrayBuffer();
        partesEntrada.push({
          inlineData: {
            data: Buffer.from(bufferArray).toString('base64'),
            mimeType: adjuntoImagen.contentType
          }
        });
      }

      const memoriasUsuario = obtenerMemorias(message.author.id);

      const systemPrompt = `${cargarPrompt()}

--- DATOS EN TIEMPO REAL DEL USUARIO ---
Usuario: ${message.author.username} (Apodo: ${message.member?.displayName || message.author.username})
Actividad actual del usuario en Discord: ${datosActividad}

--- MEMORIAS IMPORTANTES DE ESTE USUARIO ---
${memoriasUsuario}

AUTONOMÍA DE ESTADO:
Si se requiere cambiar de estado en Discord, pon al FINAL: [ESTADO: texto]

AUTONOMÍA DE MEMORIA:
Si el usuario revela algo relevante, pon al FINAL: [MEMORIA: dato]`;

      const promptEntrada = `Historial del grupo:\n${historialFormateado}\n\nMensaje de ${message.author.username}: ${message.content}`;
      partesEntrada.push(promptEntrada);

      let respuestaIA = await generarRespuestaIA(partesEntrada, systemPrompt, 100);

      // Detectar cambio de estado
      const matchEstado = respuestaIA.match(/\[ESTADO:\s*(.*?)\]/i);
      if (matchEstado) {
        const nuevoEstadoTexto = matchEstado[1].trim().substring(0, 128);
        client.user.setPresence({
          status: PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)],
          activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: nuevoEstadoTexto }]
        });
        respuestaIA = respuestaIA.replace(/\[ESTADO:\s*(.*?)\]/i, '').trim();
      }

      // Detectar memoria
      const matchMemoria = respuestaIA.match(/\[MEMORIA:\s*(.*?)\]/i);
      if (matchMemoria) {
        guardarMemoriaAutonoma(message.author.id, matchMemoria[1]);
        respuestaIA = respuestaIA.replace(/\[MEMORIA:\s*(.*?)\]/i, '').trim();
      }

      // Procesar envío de mensajes
      const mensajesSeguidos = respuestaIA.split('|||').map(m => m.trim()).filter(m => m.length > 0);

      for (let i = 0; i < mensajesSeguidos.length; i++) {
        const msgTexto = mensajesSeguidos[i];

        if (i === 0) {
          if (msgTexto.length > 2000) {
            const fragmentos = msgTexto.match(/[\s\S]{1,1900}/g);
            for (const chunk of fragmentos) await message.reply(chunk);
          } else {
            await message.reply(msgTexto);
          }
        } else {
          // Mensaje secundario (desacoplado / no linkeado)
          await message.channel.sendTyping();
          await new Promise(r => setTimeout(r, 1200));
          if (msgTexto.length > 2000) {
            const fragmentos = msgTexto.match(/[\s\S]{1,1900}/g);
            for (const chunk of fragmentos) await message.channel.send(chunk);
          } else {
            await message.channel.send(msgTexto);
          }
        }
      }

    } catch (error) {
      console.error('Error en DAREK:', error.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
