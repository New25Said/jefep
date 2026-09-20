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
    console.error('[ClinKore Engine] Error al leer config.json:', e.message);
  }
  return { nombre: 'bot', apodos: [] };
}

const botConfig = cargarConfiguracion();

// Endpoints de Gemini ordenados por prioridad de rendimiento y velocidad en 2026
const MODEL_ENDPOINTS = [
  // --- CAPA 1: Máxima Velocidad, Eficiencia y Bajo Costo (Recomendados para uso diario) ---
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',

  // --- CAPA 2: Balance Perfecto (Velocidad + Tareas Agenciales/Multimodales Complejas) ---
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent',
  
  // --- CAPA 3: Alias Dinámico Estables ---
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',

  // --- CAPA 4: Razonamiento Avanzado y Pro (Mayor latencia, máxima precisión) ---
  'https://googleapis.com', // Añadido por consistencia de línea
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
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

function aplicarEstadoEnDiscord(textoEstado) {
  const presenciaRandom = PRESENCIAS_ALEATORIAS[Math.floor(Math.random() * PRESENCIAS_ALEATORIAS.length)];
  client.user.setPresence({
    status: presenciaRandom,
    activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: textoEstado }]
  });
}

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

function programarSiguienteCambioDeEstado() {
  const minutosRandom = Math.floor(Math.random() * (20 - 10 + 1)) + 10;
  const tiempoEsperaMs = minutosRandom * 60000;

  setTimeout(() => {
    cambiarEstadoAleatorio();
    programarSiguienteCambioDeEstado();
  }, tiempoEsperaMs);
}

async function extraerContenidoUrl(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const matchTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titulo = matchTitle ? matchTitle[1].trim() : 'Sin título';
    return `[Enlace inspeccionado: ${url} | Título web: "${titulo}"]`;
  } catch (e) {
    return `[Enlace adjunto: ${url}]`;
  }
}

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

      const ultimosMensajes = await message.channel.messages.fetch({ limit: 50 });
      const historialFormateado = Array.from(ultimosMensajes.values())
        .reverse()
        .map(m => `${m.author.username}: ${m.content}`)
        .join('\n');

      let partesEntrada = [];
      let infoArchivosAdjuntos = [];

      // Procesamiento visual de imágenes y archivos optimizado para la API de Gemini
      for (const [id, attachment] of message.attachments) {
        const mime = attachment.contentType || '';
        const esImagen = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(attachment.name);

        if (esImagen) {
          try {
            const respuestaImg = await fetch(attachment.url);
            const bufferArray = await respuestaImg.arrayBuffer();
            const tipoMimeCorrecto = mime.startsWith('image/') ? mime : 'image/png';

            partesEntrada.push({
              inlineData: {
                mimeType: tipoMimeCorrecto,
                data: Buffer.from(bufferArray).toString('base64')
              }
            });
          } catch (errImg) {
            console.error('[ClinKore Engine] Error al procesar imagen:', errImg.message);
          }
        } else {
          infoArchivosAdjuntos.push(`[Adjunto recibido: ${attachment.name} (${mime}) - URL: ${attachment.url}]`);
        }
      }

      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urlsEncontradas = message.content.match(urlRegex);
      if (urlsEncontradas) {
        for (const url of urlsEncontradas) {
          const infoUrl = await extraerContenidoUrl(url);
          infoArchivosAdjuntos.push(infoUrl);
        }
      }

      const memoriasUsuario = obtenerMemorias(message.author.id);

      const systemPrompt = `${cargarPrompt()}

--- DATOS EN TIEMPO REAL DEL USUARIO ---
Usuario: ${message.author.username} (Apodo: ${message.member?.displayName || message.author.username})
Actividad actual del usuario: ${datosActividad}

--- ARCHIVOS Y ENLACES DETECTADOS ---
${infoArchivosAdjuntos.length > 0 ? infoArchivosAdjuntos.join('\n') : 'Ninguno'}

--- MEMORIAS A LARGO PLAZO DE ESTE USUARIO ---
${memoriasUsuario}

REGLA DE RÁFAGAS DE MENSAJES:
Si el usuario o el grupo enviaron varios mensajes seguidos en poco tiempo sobre el mismo tema, responde directamente abordando el tema global de la ráfaga de forma fluida.

AUTONOMÍA DE ESTADO:
Si se te pide cambiar de estado o deseas cambiarlo libremente en este instante, escribe al FINAL de tu respuesta: [ESTADO: texto del nuevo estado]

AUTONOMÍA DE MEMORIA:
Si el usuario revela algo relevante sobre su vida o gustos, escribe al FINAL de tu respuesta: [MEMORIA: dato a guardar]`;

      const promptEntrada = `Historial reciente del chat:\n${historialFormateado}\n\nMensaje actual de ${message.author.username}: ${message.content}`;
      
      // Las partes de imágenes siempre deben ubicarse al principio del arreglo
      partesEntrada.push(promptEntrada);

      let respuestaIA = await generarRespuestaIA(partesEntrada, systemPrompt, 150);

      const matchEstado = respuestaIA.match(/\[ESTADO:\s*(.*?)\]/i);
      if (matchEstado) {
        const nuevoEstadoTexto = matchEstado[1].trim().substring(0, 128);
        aplicarEstadoEnDiscord(nuevoEstadoTexto);
        respuestaIA = respuestaIA.replace(/\[ESTADO:\s*(.*?)\]/i, '').trim();
      }

      const matchMemoria = respuestaIA.match(/\[MEMORIA:\s*(.*?)\]/i);
      if (matchMemoria) {
        guardarMemoriaAutonoma(message.author.id, matchMemoria[1]);
        respuestaIA = respuestaIA.replace(/\[MEMORIA:\s*(.*?)\]/i, '').trim();
      }

      const mensajesSeguidos = respuestaIA.split('|||').map(m => m.trim()).filter(m => m.length > 0);

      for (let i = 0; i < mensajesSeguidos.length; i++) {
        const msgTexto = mensajesSeguidos[i];

        if (esDM) {
          if (i > 0) {
            await message.channel.sendTyping();
            await new Promise(r => setTimeout(r, 1000));
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
              for (const chunk of fragmentos) {
                await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
              }
            } else {
              await message.reply({ content: msgTexto, allowedMentions: { repliedUser: false } });
            }
          } else {
            await message.channel.sendTyping();
            await new Promise(r => setTimeout(r, 1000));
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
