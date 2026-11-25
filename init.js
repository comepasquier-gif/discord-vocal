const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');
const { writeToken } = require('./saved-token');

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Lance npm run init dans un terminal interactif.');
  }
  const silent = new Writable({ write(_chunk, _encoding, next) { next(); } });
  const prompt = createInterface({ input: process.stdin, output: silent, terminal: true });
  prompt.once('SIGINT', () => {
    prompt.close();
    process.stdout.write('\n');
    process.exit(130);
  });
  let token;
  try {
    process.stdout.write('Token du bot Discord (saisie masquée) : ');
    token = (await prompt.question('')).trim();
  } finally {
    prompt.close();
    process.stdout.write('\n');
  }
  if (!token || token.length > 256 || /\s/.test(token)) throw new Error('Token Discord invalide.');
  let response;
  try {
    response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bot ' + token }, redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error('Impossible de contacter Discord. Vérifie ta connexion.');
  }
  if (response.status === 401) throw new Error('Discord a refusé ce token.');
  if (!response.ok || !(await response.json()).bot) {
    throw new Error('Impossible de vérifier ce token de bot auprès de Discord.');
  }
  writeToken(token);
  console.log('Token enregistré. Lance maintenant npm start.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});