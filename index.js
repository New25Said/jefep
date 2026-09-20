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

function cargarConfiguracion() {
  try {
    if (fs.existsSync('./config.json')) {
      return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    }
  } catch (e) {
    console.error('Error al leer config.json:', e.message);
  }
  return {
    nombre: 'bot',
    apodos: []
  };
}

const botConfig = cargarConfiguracion();

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
    return 'Eres una IA servicial.';
  }
}

async function generarRespuestaIA(contents, systemInstruction, maxTokens = 120) {
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

// Genera un estado personalizado creado 100% desde cero por la IA según su personalidad
async function cambiarEstadoAleatorio() {
  const presenciaRandom = PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)];
  let estadoGenerado = 'Observando... 🙂';

  try {
    const promptEstado = `${cargarPrompt()}\n\nTAREA: Genera un texto CORTÍSIMO para tu estado de perfil de Discord (máximo 6 palabras). Que sea 100% acorde a tu personalidad. NO uses comillas ni explicaciones.`;
    const respuesta = await generarRespuestaIA(['Genera tu estado personalizado ahora.'], promptEstado, 30);
    if (respuesta && respuesta.trim()) {
      estadoGenerado = respuesta.trim().substring(0, 128);
    }
  } catch (err) {
    console.error('Error al generar estado con IA:', err.message);
  }

  client.user.setPresence({
    status: presenciaRandom,
    activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: estadoGenerado }]
  });
}

// Tirada de dado autónoma para cambiar estado aleatoriamente
function programarSiguienteCambioDeEstado() {
  const dado = Math.floor(Math.random() * 6) + 1; // Tirada de 1 a 6
  const tiempoEsperaMs = dado * 300000; // Entre 5 y 30 minutos

  setTimeout(() => {
    cambiarEstadoAleatorio();
    programarSiguienteCambioDeEstado();
  }, tiempoEsperaMs);
}

// Servidor de AutoPing para Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Servidor de IA Activo.');
}).listen(PORT, () => {
  console.log(`[AutoPing] Servidor escuchando en puerto ${PORT}`);
});

client.once('ready', () => {
  console.log(`[BOT] Vivo como ${client.user.tag}`);

  cambiarEstadoAleatorio();
  programarSiguienteCambioDeEstado();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const contenido = message.content.toLowerCase();
  const fueMencionado = message.mentions.has(client.user.id);
  const esDM = !message.guild;

  // Activa respuesta si lo mencionan, le escriben en privado, o nombran su nombre o cualquiera de sus apodos
  const detonadores = [botConfig.nombre, ...(botConfig.apodos || [])].map(n => n.toLowerCase());
  const detectoNombreOApodo = detonadores.some(detonador => detonador && contenido.includes(detonador));

  const intervieneAleatoriamente = Math.random() < 0.05;

  if (fueMencionado || esDM || detectoNombreOApodo || intervieneAleatoriamente) {
    try {
      await message.channel.sendTyping();

      let datosActividad = 'Sin información pública.';
      if (message.guild) {
        try {
          const pres = message.guild.presences.cache.get(message.author.id) || message.member?.presence;

          if (pres && pres.activities && pres.activities.length > 0) {
            const actividades = pres.activities.map(a => {
              if (a.type === ActivityType.Custom) return `Estado personalizado: "${a.state || 'N/A'}"`;
              if (a.type === ActivityType.Playing) return `Jugando a: ${a.name}`;
              if (a.type === ActivityType.Listening) return `Escuchando: ${a.details ? a.details + ' - ' + a.name : a.name}`;
              if (a.type === ActivityType.Streaming) return `En directo: ${a.name}`;
              if (a.type === ActivityType.Watching) return `Viendo: ${a.name}`;
              return `Actividad: ${a.name}`;
            }).join(' | ');

            datosActividad = `Estado: ${pres.status} | Actividades: [${actividades}]`;
          } else if (pres) {
            datosActividad = `Estado: ${pres.status} | Sin juegos/música activos.`;
          }
        } catch (e) {
          datosActividad = 'No se pudo leer la presencia.';
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
Actividad actual: ${datosActividad}

--- MEMORIAS IMPORTANTES DE ESTE USUARIO ---
${memoriasUsuario}

AUTONOMÍA DE ESTADO:
Si deseas cambiar tu estado de perfil de Discord en este instante, pon al FINAL: [ESTADO: texto del nuevo estado]

AUTONOMÍA DE MEMORIA:
Si el usuario revela algo relevante, pon al FINAL: [MEMORIA: dato]`;

      const promptEntrada = `Historial del grupo:\n${historialFormateado}\n\nMensaje de ${message.author.username}: ${message.content}`;
      partesEntrada.push(promptEntrada);

      let respuestaIA = await generarRespuestaIA(partesEntrada, systemPrompt, 120);

      // Detectar cambio de estado autónomo desde la IA
      const matchEstado = respuestaIA.match(/\[ESTADO:\s*(.*?)\]/i);
      if (matchEstado) {
        const nuevoEstadoTexto = matchEstado[1].trim().substring(0, 128);
        client.user.setPresence({
          status: PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)],
          activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: nuevoEstadoTexto }]
        });
        respuestaIA = respuestaIA.replace(/\[ESTADO:\s*(.*?)\]/i, '').trim();
      }

      // Detectar memoria autónoma
      const matchMemoria = respuestaIA.match(/\[MEMORIA:\s*(.*?)\]/i);
      if (matchMemoria) {
        guardarMemoriaAutonoma(message.author.id, matchMemoria[1]);
        respuestaIA = respuestaIA.replace(/\[MEMORIA:\s*(.*?)\]/i, '').trim();
      }

      // Envíos de mensaje
      const mensajesSeguidos = respuestaIA.split('|||').map(m => m.trim()).filter(m => m.length > 0);

      for (let i = 0; i < mensajesSeguidos.length; i++) {
        const msgTexto = mensajesSeguidos[i];

        if (esDM) {
          if (i > 0) {
            await message.channel.sendTyping();
            await new Promise(r => setTimeout(r, 1200));
          }
          if (msgTexto.length > 2000) {
            const fragmentos = msgTexto.match(/[\s\S]{1,1900}/g);
            for (const chunk of fragmentos) await message.channel.send(chunk);
          } else {
            await message.channel.send(msgTexto);
          }
        } else {
          if (i === 0) {
            if (msgTexto.length > 2000) {
              const fragmentos = msgTexto.match(/[\s\S]{1,1900}/g);
              for (const chunk of fragmentos) await message.reply(chunk);
            } else {
              await message.reply(msgTexto);
            }
          } else {
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
      }

    } catch (error) {
      console.error('Error en el bot:', error.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
