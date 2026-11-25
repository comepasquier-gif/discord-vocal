const { readFileSync, writeFileSync, renameSync } = require('node:fs');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const reason = 'Vocal Discord · Salons temporaires';
const grace = 4000;
const required = [
  [PermissionFlagsBits.ViewChannel, 'Voir le salon'],
  [PermissionFlagsBits.Connect, 'Se connecter'],
  [PermissionFlagsBits.MoveMembers, 'Déplacer les membres'],
];

function missingPermissions(guild, channel) {
  const bot = guild.members.me;
  const missing = [];
  if (!bot?.permissions.has(PermissionFlagsBits.ManageChannels)) missing.push('Gérer les salons');
  const permissions = channel && bot ? channel.permissionsFor(bot) : bot?.permissions;
  for (const [bit, label] of required) if (!permissions?.has(bit)) missing.push(label);
  return missing;
}

function discordError(error) {
  const code = Number(error.code);
  return Number.isInteger(code) && code > 0 ? ' (code Discord ' + code + ')' : '';
}

class TemporaryVoice {
  constructor(file, isOnline) {
    this.file = file;
    this.isOnline = isOnline;
    this.config = {};
    this.rooms = {};
    this.pending = new Set();
    this.deleting = new Set();
    this.timers = new Map();
    this.protectedUntil = new Map();
    this.errors = new Map();
    this.creating = new Set();
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      this.config = saved.config;
      this.rooms = saved.rooms;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  save(config = this.config, rooms = this.rooms) {
    writeFileSync(this.file + '.tmp', JSON.stringify({ config, rooms }));
    renameSync(this.file + '.tmp', this.file);
    this.config = config;
    this.rooms = rooms;
  }

  key(guild) {
    return guild.client.user.id + ':' + guild.id;
  }

  options(guild) {
    const key = this.key(guild);
    return {
      creator: this.config[key] || '',
      temporaryError: this.errors.get(key),
      temporaryMissing: missingPermissions(guild, guild.channels.cache.get(this.config[key])),
      vocalChannels: [...guild.channels.cache.values()]
        .filter(channel => channel.type === ChannelType.GuildVoice && !this.rooms[channel.id])
        .map(({ id, name }) => ({ id, name })),
    };
  }

  configure(guild, channelId) {
    const key = this.key(guild);
    if (channelId !== '') {
      const channel = guild.channels.cache.get(channelId);
      if (channel?.type !== ChannelType.GuildVoice || this.rooms[channelId]) {
        return 'Sélectionne un salon vocal permanent de ce serveur.';
      }
      const missing = missingPermissions(guild, channel);
      if (missing.length) return 'Permissions manquantes pour le bot : ' + missing.join(', ') + '.';
    }
    this.save({ ...this.config, [key]: channelId });
    this.errors.delete(key);
  }

  async createCreator(guild) {
    const key = this.key(guild);
    if (this.creating.has(key)) return { message: 'Un salon créateur est déjà en cours de création.' };
    const existing = guild.channels.cache.get(this.config[key]);
    if (existing?.type === ChannelType.GuildVoice) return { channelId: existing.id, name: existing.name };
    const missing = missingPermissions(guild);
    if (missing.length) return { message: 'Permissions manquantes pour le bot : ' + missing.join(', ') + '.' };
    this.creating.add(key);
    let channel;
    try {
      channel = await guild.channels.create({ name: 'Créer un vocal', type: ChannelType.GuildVoice, reason });
      const message = this.configure(guild, channel.id);
      if (message) throw Error(message);
      return { channelId: channel.id, name: channel.name };
    } catch (error) {
      if (channel && !this.occupied(guild, channel.id)) await channel.delete(reason).catch(() => {});
      return { message: 'Création ou enregistrement du salon impossible' + discordError(error) + '.' };
    } finally {
      this.creating.delete(key);
    }
  }

  onUpdate(previous, state) {
    const guild = state.guild;
    if (previous.channelId === state.channelId) return;
    if (previous.channelId) this.schedule(guild, previous.channelId);
    const creator = this.config[this.key(guild)];
    if (creator && state.channelId === creator) void this.create(guild, state.id, creator);
  }

  async create(guild, memberId, creatorId) {
    const key = this.key(guild);
    const operation = key + ':' + memberId;
    const current = () => this.isOnline(guild) &&
      this.config[key] === creatorId && guild.voiceStates.cache.get(memberId)?.channelId === creatorId;
    if (!current() || this.pending.has(operation)) return;

    this.pending.add(operation);
    let room;
    let step = 'Récupération du membre';
    try {
      const member = guild.voiceStates.cache.get(memberId)?.member
        || await guild.members.fetch({ user: memberId });
      if (member.user.bot || !current()) return;
      step = 'Création du salon temporaire';
      const creator = guild.channels.cache.get(creatorId);
      if (creator?.type !== ChannelType.GuildVoice) return;
      room = await guild.channels.create({
        name: ('Vocal de ' + member.displayName).slice(0, 95),
        type: ChannelType.GuildVoice,
        parent: creator.parentId || undefined,
        permissionOverwrites: [...creator.permissionOverwrites.cache.values()].map(overwrite => ({
          id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield, deny: overwrite.deny.bitfield,
        })),
        reason,
      });
      this.protectedUntil.set(room.id, Infinity);
      step = 'Sauvegarde du salon temporaire';
      this.save(this.config, { ...this.rooms, [room.id]: key });
      step = 'Déplacement du membre';
      if (current()) await member.voice.setChannel(room.id, reason);
      this.errors.delete(key);
    } catch (error) {
      this.errors.set(key, step + ' impossible' + discordError(error) + '. Vérifie les permissions du bot.');
      if (room && !this.rooms[room.id]) {
        this.protectedUntil.delete(room.id);
        if (!this.occupied(guild, room.id)) await room.delete(reason).catch(() => {});
      }
    } finally {
      this.pending.delete(operation);
      if (room) {
        if (this.rooms[room.id]) this.protectedUntil.set(room.id, Date.now() + grace);
        this.schedule(guild, room.id);
      }
    }
  }

  occupied(guild, id) {
    return guild.voiceStates.cache.some(state => state.channelId === id);
  }

  schedule(guild, id) {
    if (this.rooms[id] !== this.key(guild) || this.timers.has(id) || this.deleting.has(id)) return;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.clean(guild, id);
    }, grace);
    this.timers.set(id, timer);
    timer.unref();
  }

  sweep(guild) {
    for (const id of Object.keys(this.rooms)) this.schedule(guild, id);
  }

  async clean(guild, id) {
    if (!this.isOnline(guild) || !guild.available) return;
    const key = this.key(guild);
    if (this.rooms[id] !== key ||
        this.deleting.has(id) || this.occupied(guild, id)) return;
    if (Date.now() < (this.protectedUntil.get(id) || 0)) return this.schedule(guild, id);
    this.deleting.add(id);
    try {
      const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id);
      if (!this.isOnline(guild) || !guild.available || this.occupied(guild, id)) return;
      if (channel?.type === ChannelType.GuildVoice && channel.guildId === guild.id) await channel.delete(reason);
      this.forget(id);
    } catch (error) {
      if (error.code === 10003) {
        try { this.forget(id); } catch { this.errors.set(key, 'Impossible de sauvegarder les salons temporaires.'); }
      } else {
        this.errors.set(key, 'Impossible de supprimer un salon vide. Vérifie la permission Gérer les salons.');
      }
    } finally {
      this.deleting.delete(id);
    }
  }

  forget(id) {
    const rooms = { ...this.rooms };
    delete rooms[id];
    this.save(this.config, rooms);
    this.protectedUntil.delete(id);
  }
}

module.exports = { TemporaryVoice };