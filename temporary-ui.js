const tempForm = byId('temporary-form');
const tempGuild = byId('temporary-guild');
const tempChannel = byId('temporary-channel');
const tempButton = byId('temporary-save');
const tempStatus = byId('temporary-status');
const tempCreate = byId('temporary-create');
let tempServers = [];
let tempOnline = false;
let tempApplicationId;
let tempBusy = false;
let tempDirty = false;
let tempMessage = '';

function renderTemporary(servers, online, applicationId = tempApplicationId) {
  tempApplicationId = applicationId;
  tempServers = servers;
  tempOnline = online;
  const previous = tempGuild.value;
  if (!tempBusy) {
    setOptions(tempGuild, servers.length ? servers.map(server => [server.id, server.name])
      : [['', 'Aucun serveur connecté']]);
  }
  if (previous !== tempGuild.value) tempDirty = false;

  const server = servers.find(item => item.id === tempGuild.value);
  setOptions(tempChannel, [['', 'Désactivé'], ...(server?.vocalChannels || []).map(({ id, name }) => [id, name])],
    tempDirty ? undefined : server?.creator || '');
  tempGuild.disabled = tempChannel.disabled = tempButton.disabled = tempBusy || !online || !server;
  tempCreate.disabled = tempButton.disabled || Boolean(server?.creator && server.vocalChannels.some(channel => channel.id === server.creator));
  const admin = byId('temporary-admin');
  admin.hidden = !online || !applicationId || !server;
  if (!admin.hidden) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: applicationId, scope: 'bot', permissions: '8', guild_id: server.id,
    });
    admin.href = url.href;
  }
  const missing = server?.temporaryMissing || [];
  const message = server?.temporaryError || tempMessage || (missing.length
    ? 'Permissions manquantes pour le bot : ' + missing.join(', ') + '.'
    : online && server && !server.creator ? 'Aucun vocal créateur actif sur ce serveur.' : '');
  if (tempStatus.textContent !== message) tempStatus.textContent = message;
}

tempGuild.addEventListener('change', () => {
  tempDirty = false;
  tempMessage = '';
  renderTemporary(tempServers, tempOnline);
});
tempChannel.addEventListener('change', () => { tempDirty = true; });
tempForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!tempButton.disabled) void configureTemporary(false);
});
tempCreate.addEventListener('click', () => {
  if (!tempCreate.disabled) void configureTemporary(true);
});
async function configureTemporary(create) {
  const guildId = tempGuild.value;
  const channelId = tempChannel.value;
  tempBusy = true;
  tempMessage = 'Enregistrement…';
  renderTemporary(tempServers, tempOnline);
  try {
    const response = await fetch('/api/temporary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId, channelId, create }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    const server = tempServers.find(item => item.id === guildId);
    if (server) {
      server.creator = result.channelId ?? channelId;
      if (result.channelId && !server.vocalChannels.some(channel => channel.id === result.channelId)) {
        server.vocalChannels.push({ id: result.channelId, name: result.name });
      }
      server.temporaryError = undefined;
    }
    tempDirty = false;
    tempMessage = result.channelId || channelId ? 'Vocal créateur activé.' : 'Vocal créateur désactivé.';
  } catch (error) {
    tempMessage = error.message || 'Impossible d’enregistrer le réglage.';
  } finally {
    tempBusy = false;
    renderTemporary(tempServers, tempOnline);
  }
}