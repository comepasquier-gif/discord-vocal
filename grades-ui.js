const grade = id => document.getElementById('grade-' + id);
const gradeServer = grade('server');
const gradeMember = grade('member');
const gradeMode = grade('mode');
const gradeRole = grade('role');
const gradeOld = grade('old');
const gradeUseId = grade('use-id');
const gradeRoleId = grade('role-id');
const gradeOldId = grade('old-id');
const isRoleId = value => /^\d{17,20}$/.test(value);
const gradeMessage = grade('message');
let gradeDetails;
let gradeBusy = false;
let gradeOnline = false;
let gradeServers = [];

function renderGrades(servers, online) {
  gradeServers = servers;
  gradeOnline = online;
  if (!gradeBusy) {
    const previous = gradeServer.value;
    setOptions(gradeServer, servers.length ? servers.map(server => [server.id, server.name])
      : [['', 'Aucun serveur connecté']]);
    if (previous !== gradeServer.value) clearGradeMembers();
  }
  const server = servers.find(item => item.id === gradeServer.value);
  gradeServer.disabled = gradeBusy || !online;
  grade('query').disabled = grade('search-button').disabled = gradeBusy || !online || !server?.canManageRoles;
  gradeMember.disabled = gradeBusy || !online || gradeMember.options.length < 2;
  grade('permission').textContent = online && server && !server.canManageRoles
    ? 'Le bot a besoin de la permission Gérer les rôles sur ce serveur.' : '';

  const roles = gradeDetails?.roles || [];
  const promote = gradeMode.value === 'promote';
  const held = roles.filter(role => role.held);
  setOptions(gradeOld, [['', 'Grade actuel'], ...held.map(role => [role.id, role.name])]);
  const oldIndex = roles.findIndex(role => role.id === gradeOld.value);
  const targets = roles.filter((role, index) => gradeMode.value === 'remove' ? role.held :
    promote ? oldIndex >= 0 && index < oldIndex : !role.held);
  setOptions(gradeRole, [['', 'Choisir un rôle'], ...targets.map(role => [role.id, role.name])]);
  grade('old-field').hidden = !promote;
  gradeOld.required = promote;
  gradeMode.disabled = gradeRole.disabled = gradeOld.disabled = gradeBusy || !online || !server?.canManageRoles || !gradeDetails;
  const usingIds = gradeUseId.checked;
  const disabled = gradeMode.disabled;
  gradeUseId.disabled = disabled;
  grade('list-fields').hidden = usingIds;
  grade('id-fields').hidden = !usingIds;
  grade('old-id-field').hidden = !promote;
  gradeRole.disabled = disabled || usingIds;
  gradeOld.disabled = disabled || usingIds || !promote;
  gradeRoleId.disabled = disabled || !usingIds;
  gradeOldId.disabled = disabled || !usingIds || !promote;
  gradeRoleId.required = usingIds;
  gradeOldId.required = usingIds && promote;
  grade('apply').disabled = disabled || (usingIds
    ? !isRoleId(gradeRoleId.value) || (promote && !isRoleId(gradeOldId.value))
    : !gradeRole.value);
  grade('current').textContent = gradeDetails
    ? gradeDetails.member.name + ' · ' + (gradeDetails.current.join(', ') || 'Aucun rôle attribué') : '';
}

function updateGrades() {
  renderGrades(gradeServers, gradeOnline);
}

async function requestGrade(action, values) {
  const response = await fetch('/api/grades/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: gradeServer.value, ...values }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Action impossible pour le moment.');
  return result;
}

async function withGrades(work) {
  if (gradeBusy) return;
  gradeBusy = true;
  gradeMessage.textContent = '';
  updateGrades();
  try {
    await work();
  } catch (error) {
    gradeMessage.textContent = error.message;
  } finally {
    gradeBusy = false;
    updateGrades();
  }
}

function clearGradeMembers() {
  gradeDetails = undefined;
  gradeMember.replaceChildren(new Option('Choisir un membre', ''));
  gradeRoleId.value = gradeOldId.value = '';
}

gradeServer.addEventListener('change', () => {
  clearGradeMembers();
  gradeMessage.textContent = '';
  updateGrades();
});

grade('search').addEventListener('submit', event => {
  event.preventDefault();
  void withGrades(async () => {
    clearGradeMembers();
    const result = await requestGrade('search', { query: grade('query').value });
    for (const member of result.members) {
      gradeMember.add(new Option(member.name + ' (@' + member.username + ')', member.id));
    }
    if (!result.members.length) gradeMessage.textContent = 'Aucun membre trouvé.';
    if (result.members.length === 1) {
      gradeMember.value = result.members[0].id;
      gradeDetails = await requestGrade('member', { memberId: gradeMember.value });
    }
  });
});

gradeMember.addEventListener('change', () => {
  gradeDetails = undefined;
  if (!gradeMember.value) return updateGrades();
  void withGrades(async () => {
    gradeDetails = await requestGrade('member', { memberId: gradeMember.value });
  });
});

for (const control of [gradeRoleId, gradeOldId]) control.addEventListener('input', updateGrades);
for (const control of [gradeMode, gradeOld, gradeRole, gradeUseId]) control.addEventListener('change', updateGrades);
grade('form').addEventListener('submit', event => {
  event.preventDefault();
  const memberId = gradeMember.value;
  const mode = gradeMode.value;
  const roleId = gradeUseId.checked ? gradeRoleId.value : gradeRole.value;
  const oldRoleId = gradeUseId.checked ? gradeOldId.value : gradeOld.value;
  if (!gradeDetails || grade('apply').disabled) return;
  const roleName = id => gradeDetails.roles.find(role => role.id === id)?.name || id;
  if (!window.confirm(gradeMode.selectedOptions[0].text + ' · ' + gradeDetails.member.name +
    ' · ' + roleName(roleId) + (mode === 'promote' ? ' à la place de ' + roleName(oldRoleId) : '') + ' ?')) return;
  void withGrades(async () => {
    let message;
    try {
      message = (await requestGrade('change', { memberId, mode, roleId, oldRoleId })).message;
    } finally {
      try {
        gradeDetails = await requestGrade('member', { memberId });
      } catch {
        gradeDetails = undefined;
      }
    }
    gradeMessage.textContent = message;
  });
});