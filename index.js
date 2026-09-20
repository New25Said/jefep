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

// Cargar configuración externa de identidad
function cargarConfiguracion() {
  try {
    if (fs.existsSync('./config.json')) {
      return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    }
  } catch (e) {
    console.error('[ClinKore Engine] Error al leer config.json:', e.message);
  }
  return {
    nombre: 'bot',
    apodos: []
  };
}

const botConfig = cargarConfiguracion();

// Endpoints / Modelos en orden de fallback exacto
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
    return 'Eres una IA autónoma.';
  }
}

async function generarRespuestaIA(contents, systemInstruction, maxTokens = 150) {
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.85
        }
      });

      const result = await model.generateContent(contents);
      return result.response.text();
    } catch (error) {
      console.warn(`[Fallback] El modelo ${modelName} falló:`, error.message);
    }
  }
  throw new Error('Todos los modelos de la lista fallaron.');
}

// Aplicar un estado personalizado sin tocar la programación del dado
function aplicarEstadoEnDiscord(textoEstado) {
  const presenciaRandom = PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)];
  client.user.setPresence({
    status: presenciaRandom,
    activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: textoEstado }]
  });
}

// Genera un estado aleatorio usando la IA y su personalidad
async function cambiarEstadoAleatorio() {
  try {
    const promptEstado = `${cargarPrompt()}\n\nTAREA: Genera un texto CORTÍSIMO para tu estado de perfil de Discord (máximo 6 palabras). Que sea 100% acorde a tu personalidad. NO comillas ni explicaciones.`;
    const respuesta = await generarRespuestaIA(['Genera tu estado de perfil actual.'], promptEstado, 30);
    if (respuesta && respuesta.trim()) {
      aplicarEstadoEnDiscord(respuesta.trim().substring(0, 128));
    }
  } catch (err) {
    console.error('[ClinKore Engine] Error al generar estado con IA:', err.message);
  }
}

// Tirada de dado autónoma (5 a 15 minutos) que no se reinicia al cambiar estado manualmente
function programarSiguienteCambioDeEstado() {
  const minutosRandom = Math.floor(Math.random() * (15 - 5 + 1)) + 5; // Entre 5 y 15 minutos
  const tiempoEsperaMs = minutosRandom * 60000;

  setTimeout(() => {
    cambiarEstadoAleatorio();
    programarSiguienteCambioDeEstado();
  }, tiempoEsperaMs);
}

// Servidor de AutoPing para Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ClinKore v1 Engine Activo.');
}).listen(PORT, () => {
  console.log(`[AutoPing] Servidor escuchando en puerto ${PORT}`);
});

client.once('ready', () => {
  console.log(`[ClinKore v1] Online como ${client.user.tag}`);

  cambiarEstadoAleatorio();
  programarSiguienteCambioDeEstado();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const contenido = message.content.toLowerCase();
  const fueMencionado = message.mentions.has(client.user.id);
  const esDM = !message.guild;

  // Detonadores dinámicos leídos desde config.json
  const detonadores = [botConfig.nombre, ...(botConfig.apodos || [])].map(n => n.toLowerCase());
  const detectoNombreOApodo = detonadores.some(detonador => detonador && contenido.includes(detonador));

  const intervieneAleatoriamente = Math.random() < 0.05;

  if (fueMencionado || esDM || detectoNombreOApodo || intervieneAleatoriamente) {
    try {
      await message.channel.sendTyping();

      let datosActividad = 'Sin información pública.';
      if (message.guild) {
        try {
          const miembroActualizado = await message.guild.members.fetch({ user: message.author.id, force: true });
          const pres = miembroActualizado.presence;

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
            datosActividad = `Estado: ${pres.status} | Sin actividades/música/juegos activos.`;
          }
        } catch (e) {
          datosActividad = 'No se pudo leer la presencia en tiempo real.';
        }
      }

      // Máximo historial de mensajes para no confundirse
      const ultimosMensajes = await message.channel.messages.fetch({ limit: 50 });
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
Actividad actual del usuario: ${datosActividad}

--- MEMORIAS A LARGO PLAZO DE ESTE USUARIO ---
${memoriasUsuario}

AUTONOMÍA DE ESTADO:
Si se te pide cambiar de estado o deseas cambiarlo libremente en este instante, escribe al FINAL de tu respuesta: [ESTADO: texto del nuevo estado]

AUTONOMÍA DE MEMORIA:
Si el usuario revela algo relevante sobre su vida o gustos, escribe al FINAL de tu respuesta: [MEMORIA: dato a guardar]`;

      const promptEntrada = `Historial reciente del chat:\n${historialFormateado}\n\nMensaje actual de ${message.author.username}: ${message.content}`;
      partesEntrada.push(promptEntrada);

      let respuestaIA = await generarRespuestaIA(partesEntrada, systemPrompt, 150);

      // Detectar cambio de estado autónomo (Sin borrar ni alterar el temporizador activo)
      const matchEstado = respuestaIA.match(/\[ESTADO:\s*(.*?)\]/i);
      if (matchEstado) {
        const nuevoEstadoTexto = matchEstado[1].trim().substring(0, 128);
        aplicarEstadoEnDiscord(nuevoEstadoTexto);
        respuestaIA = respuestaIA.replace(/\[ESTADO:\s*(.*?)\]/i, '').trim();
      }

      // Detectar guardado de memoria autónoma
      const matchMemoria = respuestaIA.match(/\[MEMORIA:\s*(.*?)\]/i);
      if (matchMemoria) {
        guardarMemoriaAutonoma(message.author.id, matchMemoria[1]);
        respuestaIA = respuestaIA.replace(/\[MEMORIA:\s*(.*?)\]/i, '').trim();
      }

      // Procesar envíos de mensajes
      const mensajesSeguidos = respuestaIA.split('|||').map(m => m.trim()).filter(m => m.length > 0);

      for (let i = 0; i < mensajesSeguidos.length; i++) {
        const msgTexto = mensajesSeguidos[i];

        if (esDM) {
          // En MD nunca realiza reply/linkeo
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
          // En servidores: el primer mensaje cita/reply, los siguientes se envían sueltos
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
      console.error('[ClinKore Engine] Error en la interacción:', error.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
