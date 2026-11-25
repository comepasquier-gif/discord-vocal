# Vocal Discord

Vocal Discord est un tableau de bord local pour mesurer le temps passé en vocal, gérer les rôles et créer des salons vocaux temporaires.

## 1. Installer Node.js et récupérer le projet

1. Installe **Node.js 26 LTS**, qui inclut npm. Sous Windows, choisis l’installateur `.msi`, puis ouvre un nouveau terminal. [Télécharger Node.js](https://nodejs.org/en/download)
2. Sur GitHub, clique sur **Code → Download ZIP**, puis extrais l’archive. Si tu as déjà reçu l’archive de Vocal Discord, extrais-la directement.
3. Ouvre un terminal dans le dossier extrait qui contient `package.json`. Sous Windows, ouvre ce dossier dans l’Explorateur, saisis `cmd` dans la barre d’adresse et appuie sur **Entrée**.
4. Vérifie que Node.js et npm sont disponibles, puis installe les dépendances.

```sh
node -v
npm -v
npm ci
```

La version affichée par `node -v` doit être **v26 ou supérieure**. Attends que `npm ci` se termine avant de passer à la suite.

## 2. Créer ton bot Discord et l’ajouter au serveur

1. Ouvre le portail développeur Discord, clique sur **New Application**, donne un nom à ton bot et crée l’application. [Ouvrir le portail Discord](https://discord.com/developers/applications)
2. Dans **Installation**, active **Guild Install**. Sélectionne **Discord Provided Link**, puis ajoute le scope `bot` dans les réglages de **Guild Install**.
3. Dans la liste des permissions, coche celles qui correspondent aux fonctions que tu veux utiliser.

   | Fonction | Permissions Discord |
   | --- | --- |
   | Suivi vocal et mesure de la parole | **Voir le salon**, **Se connecter** |
   | Création et suppression des vocaux temporaires | **Gérer les salons**, **Déplacer les membres**, **Voir le salon**, **Se connecter** |
   | Attribution, retrait et promotion de rôles | **Gérer les rôles** |

4. Enregistre les réglages et ouvre le lien d’installation. Choisis **Ajouter à un serveur**, sélectionne ton serveur et confirme. Utilise un compte qui a la permission **Gérer le serveur**.
5. Pour gérer les grades, ouvre **Paramètres du serveur → Rôles** dans Discord et place le rôle du bot au-dessus des rôles qu’il doit modifier.

Les options **Privileged Gateway Intents** peuvent rester désactivées. [Guide d’installation Discord](https://docs.discord.com/developers/quick-start/getting-started#installing-your-app) · [Hiérarchie des rôles](https://docs.discord.com/developers/topics/permissions#role-hierarchy)

## 3. Enregistrer le token depuis le terminal

1. Dans le portail développeur, ouvre l’onglet **Bot** de ton application. Utilise **Reset Token** pour générer un token si nécessaire, puis copie-le.
2. Dans le dossier du projet, lance :

   ```sh
   cd discord-vocal-main
   npm run init
   ```

3. Quand le terminal te demande le token, colle-le et appuie sur **Entrée**. La saisie est masquée. Attends le message **Token enregistré** avant de démarrer.

Garde le token privé. En cas de fuite, régénère-le dans Discord, relance `npm run init` et redémarre Vocal Discord. [Gestion du token Discord](https://docs.discord.com/developers/quick-start/getting-started#fetching-your-credentials)

## 4. Démarrer et tester

```sh
npm start
```

Ouvre [http://127.0.0.1:3210](http://127.0.0.1:3210) si le navigateur ne s’ouvre pas. Attends que le tableau de bord affiche **En ligne**. Dès les démarrages suivants, `npm start` suffit.

- **Suivi vocal**. Rejoins un vocal de ton serveur et vérifie ton temps de présence dans **Classement vocal**. Pour mesurer la parole, choisis le salon dans **Temps de parole**, puis clique sur **Appliquer**. Le bot analyse le son reçu dans ce salon sans enregistrer l’audio. La mesure est une estimation et peut inclure des bruits suffisamment forts.
- **Vocal créateur**. Choisis ton serveur et clique sur **Créer et activer**, ou sélectionne un vocal existant et clique sur **Enregistrer**. Rejoins le vocal créateur dans Discord. Le bot doit te déplacer dans un salon à ton nom. Quitte ce salon pour vérifier qu’il est supprimé quelques secondes après le dernier départ.
- **Grades**. Recherche un membre par pseudo ou ID. Choisis **Attribuer un rôle**, **Retirer un rôle** ou **Promouvoir**, puis sélectionne les rôles ou coche **Saisir les identifiants des rôles** pour coller leurs ID.

Garde le terminal ouvert pour que le bot continue de fonctionner. Pour l’arrêter, appuie sur **Ctrl+C**.

## Dépannage

| Problème | Solution |
| --- | --- |
| `node` ou `npm` est introuvable | Installe Node.js 26 et ouvre un nouveau terminal. |
| PowerShell indique que `npm.ps1` est bloqué | Utilise l’Invite de commandes ou remplace `npm` par `npm.cmd` dans PowerShell. |
| `npm ci` ne trouve pas `package.json` | Extrais le ZIP et ouvre le terminal dans le dossier qui contient `package.json` et `package-lock.json`. |
| Le token est refusé | Copie le token de l’onglet **Bot**, puis relance `npm run init`. |
| Le serveur Discord n’apparaît pas | Vérifie que le bot correspondant au token figure bien dans la liste des membres du serveur. |
| Le bot ne crée pas le salon ou ne déplace pas le membre | Lis le message sous **Vocal créateur** et vérifie les permissions sur le salon et sa catégorie. |
| Un grade est absent ou impossible à modifier | Vérifie **Gérer les rôles** et place le rôle du bot au-dessus du grade concerné. |
| Le terminal affiche `EADDRINUSE` | Ferme l’autre instance ou démarre avec un autre port. Sous PowerShell, lance `$env:PORT = '3211'`, puis `npm.cmd start`. Ouvre l’adresse affichée dans le terminal. |

## Données locales

Le tableau de bord écoute uniquement sur `127.0.0.1`. Le token, les statistiques et les réglages restent hors du projet.

- **Windows** · `%LOCALAPPDATA%\Vocal Discord`. Le token est chiffré pour le compte Windows courant. Ce dossier est partagé avec la version `.exe`.
- **Linux et macOS** · `$XDG_DATA_HOME/vocal-discord` si cette variable est définie, sinon `~/.local/share/vocal-discord`. Le token est stocké dans un fichier local avec des permissions `0600`.

## Publier le code sur GitHub

Crée un dépôt vide sur GitHub et lance ces commandes dans le dossier du projet. Remplace `TON-COMPTE` et `vocal-discord` par ton identifiant et le nom du dépôt.

```sh
git init -b main
git add .
git commit -m "Version initiale de Vocal Discord"
git remote add origin https://github.com/TON-COMPTE/vocal-discord.git
git push -u origin main
```

Licence [MIT](LICENSE).
