const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const Opus = require('opusscript');

function audibleMilliseconds(pcm) {
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    energy += sample * sample;
  }
  const samples = pcm.length / 2;
  return samples && Math.sqrt(energy / samples) >= 160 ? samples / 48 : 0;
}

function listen(channel, totals, botId) {
  const guild = channel.guild;
  const connection = joinVoiceChannel({
    guildId: guild.id, channelId: channel.id,
    adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true,
  });
  const streams = new Map();
  let state = 'connecting';
  let timer;

  function release(id) {
    streams.get(id)?.destroy();
  }

  function fail() {
    state = 'error';
    if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
  }

  function updateState() {
    clearTimeout(timer);
    if (connection.state.status === VoiceConnectionStatus.Ready) {
      state = 'ready';
    } else {
      for (const id of streams.keys()) release(id);
      if (state === 'error') return;
      if ([VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Disconnected].includes(connection.state.status)) {
        state = 'error';
      } else {
        state = 'connecting';
        timer = setTimeout(fail, 20_000);
      }
    }
  }

  connection.on('error', fail);
  connection.on('stateChange', updateState);
  updateState();

  function eligible(id) {
    const voice = guild.voiceStates.cache.get(id);
    return voice?.channelId === channel.id && !voice.mute && !voice.suppress &&
      id !== botId && !voice.member?.user.bot;
  }

  connection.receiver.speaking.on('start', id => {
    if (state !== 'ready' || streams.has(id) || !eligible(id)) return;
    const decoder = new Opus(48000, 1, Opus.Application.VOIP, { wasm: false });
    const stream = connection.receiver.subscribe(id);
    streams.set(id, stream);
    stream.on('data', packet => {
      if (state !== 'ready' || !eligible(id)) return;
      try {
        const duration = audibleMilliseconds(decoder.decode(packet));
        if (duration) totals.addSpeech(botId, guild.id, id, duration);
      } catch {
        // A malformed or unsupported packet contributes no time.
      }
    });
    stream.on('error', () => release(id));
    stream.once('close', () => {
      decoder.delete();
      if (streams.get(id) === stream) streams.delete(id);
    });
  });
  connection.receiver.speaking.on('end', release);

  return {
    channel: channel.id,
    get state() { return state; },
    close() {
      clearTimeout(timer);
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
      for (const id of streams.keys()) release(id);
    },
  };
}

module.exports = { listen, audibleMilliseconds };