const { createServer } = require('node:http');
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');
const { Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const { VoiceTotals } = require('./voice');
const { listen } = require('./speech');
const { folder, readToken } = require('./saved-token');
const { canManage, grades } = require('./grades');
const { TemporaryVoice } = require('./temporary-voice');

const port = Number(process.env.PORT || 3210);
let origin;
mkdirSync(folder, { recursive: true, mode: 0o700 });
const file = join(folder, 'statistiques.json');
let saved = {};
try {
  saved = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const totals = new VoiceTotals(saved, () => performance.now());
let client;
let status = 'connecting';
let botId;
let storageError = false;
const listeners = new Map();
const temporary = new TemporaryVoice(join(folder, 'vocaux-temporaires.json'),
  guild => status === 'online' && client === guild.client && client.isReady());

function closeListener(guildId) {
  listeners.get(guildId)?.close();
  listeners.delete(guildId);
}

function closeListeners() {
  for (const id of listeners.keys()) closeListener(id);
}

function save() {
  try {
    writeFileSync(file + '.tmp', JSON.stringify(totals.snapshot()));
    renameSync(file + '.tmp', file);
    storageError = false;
  } catch {
    if (!storageError) console.error('Impossible d’enregistrer les statistiques locales.');
    storageError = true;
  }
}

function stop() {
  closeListeners();
  totals.pause();
  save();
  const previous = client;
  client = undefined;
  status = 'offline';
  if (previous) void previous.destroy().catch(() => {});
}

function connect(token) {
  const connection = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  client = connection;
  status = 'connecting';

  function track(state) {
    const user = state.member?.user;
    if (user?.bot || state.id === botId) return;
    totals.update(botId, state.guild.id, state.id, state.channelId,
      state.member?.displayName, state.channel?.name, Boolean(state.mute || state.suppress));
  }

  function sync() {
    if (client !== connection || !connection.isReady()) return;
    botId = connection.user.id;
    status = 'online';
    for (const guild of connection.guilds.cache.values()) {
      if (!guild.available) continue;
      for (const state of guild.voiceStates.cache.values()) track(state);
      temporary.sweep(guild);
    }
  }

  connection.on(Events.ClientReady, sync);
  connection.on(Events.ShardReady, () => setImmediate(sync));
  connection.on(Events.ShardResume, sync);
  connection.on(Events.ShardReconnecting, pause);
  connection.on(Events.ShardDisconnect, pause);
  connection.on(Events.Error, () => {});
  connection.on(Events.ShardError, () => {});

  function pause() {
    if (client !== connection) return;
    totals.pause();
    save();
    closeListeners();
    status = 'reconnecting';
  }

  connection.on(Events.VoiceStateUpdate, (previous, state) => {
    if (client !== connection || status !== 'online') return;
    track(state);
    temporary.onUpdate(previous, state);
    if (!state.channelId) save();
  });
  for (const event of [Events.GuildCreate, Events.GuildAvailable]) {
    connection.on(event, guild => {
      if (client !== connection || status !== 'online') return;
      for (const state of guild.voiceStates.cache.values()) track(state);
      temporary.sweep(guild);
    });
  }
  for (const event of [Events.GuildDelete, Events.GuildUnavailable]) {
    connection.on(event, guild => {
      if (client !== connection) return;
      closeListener(guild.id);
      totals.pause(botId, guild.id);
      save();
    });
  }

  void connection.login(token).catch(error => {
    if (client !== connection) return;
    stop();
    status = error.code === 'TokenInvalid' || error.status === 401
      ? 'invalid' : 'error';
  });
}

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/grades-ui.js', ['grades-ui.js', 'text/javascript']],
  ['/temporary-ui.js', ['temporary-ui.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
].map(([url, [name, type]]) => [url, [readFileSync(join(__dirname, name)), type]]));

function json(response, code, value) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; form-action 'self'");
  if (request.headers.host !== new URL(origin).host) return json(response, 403, {});
  if (request.method === 'GET') {
    const asset = assets.get(request.url);
    if (asset) {
      response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
      return response.end(asset[0]);
    }
    if (request.url === '/api/status') {
      const guilds = client?.isReady()
        ? [...client.guilds.cache.values()].map(guild => ({
          id: guild.id, name: guild.name, canManageRoles: canManage(guild),
          ...temporary.options(guild),
          channels: [...guild.channels.cache.values()]
            .filter(channel => channel.type === ChannelType.GuildVoice &&
              channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]))
            .map(({ id, name }) => ({ id, name })),
          listening: listeners.get(guild.id)?.channel,
          voiceStatus: listeners.get(guild.id)?.state,
        })) : [];
      return json(response, 200, {
        status, storageError, bot: status === 'online' ? client.user.username : null,
        applicationId: status === 'online' ? client.application?.id || client.user.id : null,
        guilds, rows: totals.rows(botId),
      });
    }
  }
  if (request.method === 'POST') {
    if (request.headers.origin !== origin) return json(response, 403, {});
    const gradeAction = /^\/api\/grades\/(search|member|change)$/.exec(request.url)?.[1];
    if (gradeAction) {
      if (status !== 'online') return json(response, 409, { message: 'Le bot doit être connecté.' });
      let raw = '';
      let body;
      try {
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 2048) return json(response, 413, { message: 'Requête trop longue.' });
        }
        body = JSON.parse(raw);
      } catch {
        return json(response, 400, { message: 'Requête invalide.' });
      }
      const guild = client?.guilds.cache.get(body?.guildId);
      if (!guild?.available) return json(response, 404, { message: 'Serveur introuvable.' });
      const { status: code = 200, ...result } = await grades(guild, gradeAction, body);
      return json(response, code, result);
    }
    if (request.url === '/api/temporary') {
      if (status !== 'online') return json(response, 409, { message: 'Le bot doit être connecté.' });
      let raw = '';
      let body;
      try {
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 2048) return json(response, 413, { message: 'Requête trop longue.' });
        }
        body = JSON.parse(raw);
      } catch {
        return json(response, 400, { message: 'Requête invalide.' });
      }
      const guild = client?.guilds.cache.get(body?.guildId);
      if (!guild?.available || (body.create !== true && typeof body.channelId !== 'string')) {
        return json(response, 400, { message: 'Serveur ou salon invalide.' });
      }
      try {
        if (body.create === true) {
          const result = await temporary.createCreator(guild);
          return json(response, result.message ? 400 : 200, result);
        }
        const message = temporary.configure(guild, body.channelId);
        return message ? json(response, 400, { message }) : json(response, 200, {});
      } catch {
        return json(response, 500, { message: 'Impossible de sauvegarder le réglage sur ce PC.' });
      }
    }
    if (request.url === '/api/listen') {
      if (status !== 'online') return json(response, 409, {});
      let body = '';
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 2048) return json(response, 413, {});
        }
        const { guildId, channelId } = JSON.parse(body);
        const guild = client?.guilds.cache.get(guildId);
        if (!guild?.available) return json(response, 404, {});
        if (!channelId) {
          closeListener(guild.id);
          return json(response, 200, {});
        }
        const channel = guild.channels.cache.get(channelId);
        if (channel?.type !== ChannelType.GuildVoice ||
            !channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
          return json(response, 403, {});
        }
        closeListener(guild.id);
        listeners.set(guild.id, listen(channel, totals, botId));
        return json(response, 200, {});
      } catch {
        return json(response, 400, {});
      }
    }

  }
  return json(response, 404, {});
});

setInterval(() => { if (status === 'online' || storageError) save(); }, 15_000).unref();
setInterval(() => {
  if (status !== 'online' || !client?.isReady()) return;
  for (const guild of client.guilds.cache.values()) {
    if (guild.available) temporary.sweep(guild);
  }
}, 30_000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stop();
    server.close(() => process.exit(0));
  });
}

server.listen(port, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  console.log('Vocal Discord : ' + origin);
  try {
    const token = readToken();
    if (token) connect(token);
    else status = 'unconfigured';
  } catch {
    status = 'credential_error';
  }
  if (process.argv.includes('--open') && !process.argv.includes('--no-browser') && process.platform === 'win32') {
    require('node:child_process').spawn('explorer.exe', [origin], {
      detached: true, stdio: 'ignore', windowsHide: true,
    }).on('error', () => console.error('Ouvre cette adresse dans ton navigateur : ' + origin)).unref();
  }
});