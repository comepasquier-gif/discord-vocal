const byId = id => document.getElementById(id);
const guild = byId('guild');
const status = byId('status');
const labels = {
  unconfigured: 'Initialisation requise', credential_error: 'Token illisible',
  offline: 'Hors ligne', connecting: 'Connexion…', online: 'En ligne',
  reconnecting: 'Reconnexion…', invalid: 'Token invalide', error: 'Connexion échouée',
};
const voiceGuild = byId('voice-guild');
const voiceChannel = byId('voice-channel');
let voiceChanged = false;
let data;
let busy = false;
let requestError = '';
let generation = 0;

function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return [hours && hours + ' h', minutes && minutes + ' min', seconds % 60 + ' s']
    .filter(Boolean).join(' ');
}

function showError(message) {
  byId('error').textContent = message;
  byId('error').hidden = !message;
}

function setOptions(select, entries, value) {
  const current = select.value;
  const unchanged = select.options.length === entries.length &&
    entries.every(([id, name], index) => {
      const option = select.options[index];
      return option.value === id && option.text === name;
    });
  if (!unchanged) select.replaceChildren(...entries.map(([id, name]) => new Option(name, id)));
  const preferred = value ?? current;
  if (entries.some(([id]) => id === preferred)) select.value = preferred;
}

function renderVoice() {
  const servers = data.guilds;
  setOptions(voiceGuild, servers.length ? servers.map(server => [server.id, server.name])
    : [['', 'Aucun serveur connecté']]);
  const selected = servers.find(server => server.id === voiceGuild.value);
  const options = [['', 'Aucun salon'], ...(selected?.channels || []).map(channel => [channel.id, channel.name])];
  setOptions(voiceChannel, options, voiceChanged ? undefined : selected?.listening || '');
  voiceGuild.disabled = voiceChannel.disabled = byId('voice-submit').disabled =
    busy || data.status !== 'online' || !selected;
  const messages = {
    ready: 'Suivi de la parole actif dans ce salon.',
    connecting: 'Connexion au salon vocal…',
    error: 'Connexion vocale impossible ou interrompue. Sélectionne le salon et réessaie.',
  };
  const message = messages[selected?.voiceStatus] || 'La parole est mesurée uniquement dans le salon suivi.';
  if (byId('voice-status').textContent !== message) byId('voice-status').textContent = message;
}

function render() {
  if (!data) return;
  const names = new Map(data.guilds.map(({ id, name }) => [id, name]));
  for (const row of data.rows) if (!names.has(row.guild)) names.set(row.guild, row.guild);
  renderVoice();
  renderGrades(data.guilds, data.status === 'online');
  renderTemporary(data.guilds, data.status === 'online', data.applicationId);
  setOptions(guild, [['', 'Tous les serveurs'], ...names]);

  const rows = data.rows.filter(row => !guild.value || row.guild === guild.value)
    .sort((a, b) => b.duration - a.duration);
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const text of [row.name, names.get(row.guild), row.channel ? row.channel + (row.muted ? ' · Micro coupé' : '') : '—',
      duration(row.duration), duration(row.mutedDuration), row.speechDuration ? duration(row.speechDuration) : '—']) {
      tr.insertCell().textContent = text;
    }
    if (row.channel) tr.cells[2].classList.add('live');
    fragment.append(tr);
  }
  byId('rows').replaceChildren(fragment);
  byId('active').textContent = rows.filter(row => row.channel).length;
  byId('members').textContent = new Set(rows.map(row => row.member)).size;
  byId('duration').textContent = duration(rows.reduce((sum, row) => sum + row.duration, 0));
  byId('empty').hidden = rows.length > 0;
  byId('empty').textContent = data.status === 'online'
    ? 'Aucune présence enregistrée. Rejoins un salon vocal pour lancer le compteur.'
    : 'Le suivi démarre à la connexion du bot.';
  status.dataset.state = data.status;
  status.textContent = [labels[data.status], data.bot].filter(Boolean).join(' · ');
  showError(requestError || (data.storageError ? 'La sauvegarde locale a échoué.' : '') ||
    (data.status === 'unconfigured' ? 'Lance npm run init dans le terminal, puis redémarre cette application.' : '') ||
    (['invalid', 'credential_error'].includes(data.status) ? 'Relance npm run init dans le terminal pour remplacer le token, puis redémarre cette application.' : '') ||
    (data.status === 'error' ? 'Connexion à Discord impossible. Vérifie le token et ta connexion Internet.' : ''));
}

async function refresh() {
  const current = generation;
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error();
    const latest = await response.json();
    if (current !== generation) return;
    data = latest;
    render();
  } catch {
    if (current === generation) showError('Le serveur local ne répond pas.');
  }
}

async function action(endpoint, body) {
  if (busy) return;
  busy = true;
  generation++;
  requestError = '';
  render();
  try {
    const response = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
  } catch {
    requestError = 'Action impossible. Vérifie le token ou l’état du serveur local.';
  } finally {
    busy = false;
    generation++;
    await refresh();
  }
}

guild.addEventListener('change', render);
voiceGuild.addEventListener('change', () => {
  voiceChanged = false;
  renderVoice();
});
voiceChannel.addEventListener('change', () => { voiceChanged = true; });
byId('listen').addEventListener('submit', event => {
  event.preventDefault();
  voiceChanged = false;
  void action('listen', { guildId: voiceGuild.value, channelId: voiceChannel.value });
});

async function poll() {
  await refresh();
  setTimeout(poll, 1000);
}
void poll();