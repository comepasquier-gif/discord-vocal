const { PermissionFlagsBits } = require('discord.js');
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const audit = 'Vocal Discord · Gestion des grades';
const error = (status, message) => ({ status, message });
const summary = member => ({ id: member.id, name: member.displayName, username: member.user.username });
const pending = new Set();

function canManage(guild) {
  return Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles));
}

function manageableRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id && role.editable && !role.managed)
    .sort((a, b) => b.comparePositionTo(a));
}

async function grades(guild, action, body) {
  if (!canManage(guild)) return error(403, 'Donne au bot la permission Gérer les rôles.');
  try {
    if (action === 'search') {
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (!query || query.length > 100) return error(400, 'Saisis un pseudo ou un identifiant Discord.');
      const members = snowflake(query)
        ? [await guild.members.fetch({ user: query, force: true })]
        : [...(await guild.members.search({ query, limit: 15 })).values()];
      return { members: members.map(summary) };
    }
    if (!snowflake(body.memberId)) return error(400, 'Sélectionne un membre.');
    if (action === 'member') {
      const member = await guild.members.fetch({ user: body.memberId, force: true });
      const roles = manageableRoles(guild);
      return {
        member: summary(member),
        roles: roles.map(({ id, name }) => ({ id, name, held: member.roles.cache.has(id) })),
        current: [...member.roles.cache.values()].filter(role => role.id !== guild.id).map(role => role.name),
      };
    }
    if (action !== 'change' || !['add', 'remove', 'promote'].includes(body.mode)) {
      return error(400, 'Action inconnue.');
    }
    const key = guild.id + ':' + body.memberId;
    if (pending.has(key)) return error(409, 'Une modification est déjà en cours pour ce membre.');
    pending.add(key);
    try {
      return await change(guild, body);
    } finally {
      pending.delete(key);
    }
  } catch (cause) {
    if (cause.code === 10007) return error(404, 'Ce membre est introuvable sur ce serveur.');
    if (cause.code === 50013 || cause.code === 50001) {
      return error(403, 'Discord a refusé l’action. Vérifie les permissions et la position du rôle du bot.');
    }
    return error(502, 'Discord n’a pas confirmé l’action. Vérifie les rôles du membre avant de réessayer.');
  }
}

async function change(guild, { memberId, mode, roleId, oldRoleId }) {
  const member = await guild.members.fetch({ user: memberId, force: true });
  const roles = manageableRoles(guild);
  const role = roles.find(item => item.id === roleId);
  if (!role) return error(403, 'Ce rôle doit être placé sous le rôle du bot.');
  if (mode === 'remove') {
    await member.roles.remove(role.id, audit);
    return { message: 'Rôle retiré à ' + member.displayName + '.' };
  }
  if (mode === 'add') {
    await member.roles.add(role.id, audit);
    return { message: 'Rôle attribué à ' + member.displayName + '.' };
  }
  const previous = roles.find(item => item.id === oldRoleId);
  if (!previous || role.comparePositionTo(previous) <= 0) {
    return error(400, 'Sélectionne un grade actuel et un nouveau grade placé plus haut.');
  }
  if (!member.roles.cache.has(previous.id)) {
    if (member.roles.cache.has(role.id)) return { message: 'Le nouveau grade est déjà attribué.' };
    return error(409, 'Le membre ne possède plus le grade à remplacer.');
  }
  await member.roles.add(role.id, audit);
  try {
    await member.roles.remove(previous.id, audit);
  } catch {
    return error(502, 'Nouveau grade attribué. Discord n’a pas confirmé le retrait de l’ancien. Vérifie les rôles avant de réessayer.');
  }
  return { message: member.displayName + ' a été promu au grade ' + role.name + '.' };
}

module.exports = { canManage, grades };