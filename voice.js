class VoiceTotals {
  constructor(saved, clock) {
    this.saved = new Map(Object.entries(saved));
    this.active = new Map();
    this.clock = clock;
  }

  update(bot, guild, member, channel, name, channelName, muted = false) {
    const key = [bot, guild, member].join(':');
    if (!channel) {
      this.finish(key);
      return;
    }
    const row = this.saved.get(key) || { bot, guild, member, duration: 0 };
    row.name = name || row.name || member;
    this.saved.set(key, row);
    const now = this.clock();
    const previous = this.active.get(key);
    if (previous?.mutedSince != null && !muted) {
      row.mutedDuration = (row.mutedDuration ?? 0) + now - previous.mutedSince;
    }
    this.active.set(key, {
      since: previous?.since ?? now,
      channel: channelName || 'Salon vocal',
      mutedSince: muted ? previous?.mutedSince ?? now : null,
    });
  }

  addSpeech(bot, guild, member, elapsed) {
    const key = [bot, guild, member].join(':');
    const row = this.saved.get(key);
    const session = this.active.get(key);
    if (row && session && session.mutedSince == null) {
      row.speechDuration = (row.speechDuration ?? 0) + elapsed;
    }
  }

  finish(key) {
    const session = this.active.get(key);
    if (!session) return;
    const row = this.saved.get(key);
    const now = this.clock();
    row.duration += Math.max(0, now - session.since);
    if (session.mutedSince != null) {
      row.mutedDuration = (row.mutedDuration ?? 0) + now - session.mutedSince;
    }
    this.active.delete(key);
  }

  pause(bot, guild) {
    for (const key of this.active.keys()) {
      const row = this.saved.get(key);
      if (!guild || (row.bot === bot && row.guild === guild)) this.finish(key);
    }
  }

  rows(bot) {
    return [...this.saved.keys()]
      .filter(key => this.saved.get(key).bot === bot)
      .map(key => this.current(key));
  }

  current(key) {
    const row = this.saved.get(key);
    const session = this.active.get(key);
    return {
      ...row,
      duration: row.duration + (session ? Math.max(0, this.clock() - session.since) : 0),
      channel: session?.channel ?? null,
      muted: session?.mutedSince != null,
      mutedDuration: (row.mutedDuration ?? 0) +
        (session?.mutedSince != null ? this.clock() - session.mutedSince : 0),
      speechDuration: row.speechDuration ?? 0,
    };
  }

  snapshot() {
    return Object.fromEntries([...this.saved.keys()].map(key => {
      const { channel, muted, ...row } = this.current(key);
      return [key, row];
    }));
  }
}

module.exports = { VoiceTotals };