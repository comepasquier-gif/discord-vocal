const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { randomUUID } = require('node:crypto');

const windows = process.platform === 'win32';
const folder = windows
  ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Vocal Discord')
  : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'vocal-discord');
const file = join(folder, windows ? 'bot-token.dpapi' : 'bot-token');

function dpapi(statements, input) {
  const powershell = join(process.env.SystemRoot || 'C:/Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe');
  return execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    ...statements,
  ].join('; ')], {
    env: { ...process.env, VOCAL_DISCORD_TOKEN_FILE: file },
    input, stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8',
    windowsHide: true, timeout: 10_000,
  });
}

function readToken() {
  if (!existsSync(file)) return null;
  const token = (windows ? dpapi([
    '$encrypted = [IO.File]::ReadAllBytes($env:VOCAL_DISCORD_TOKEN_FILE)',
    '$plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Write([Text.Encoding]::UTF8.GetString($plain))',
  ]) : readFileSync(file, 'utf8')).trim();
  if (!token || /\s/.test(token)) throw new Error('Token enregistré illisible.');
  return token;
}

function writeToken(token) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const contents = windows ? Buffer.from(dpapi([
      '$plain = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
      '$encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[Console]::Write([Convert]::ToBase64String($encrypted))',
    ], Buffer.from(token).toString('base64')), 'base64') : token;
    if (!contents.length) throw new Error('Empty protected credential');
    writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } catch {
    throw new Error('Impossible d’enregistrer le token dans ton dossier de données.');
  } finally {
    rmSync(temporary, { force: true });
  }
}

module.exports = { folder, readToken, writeToken };