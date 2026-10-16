# recon/ — Harnais de Phase 0

Code **jetable**. Pas de TypeScript, pas de dépendances, pas de build : le plan interdit
tout code de production avant que la Phase 0 soit close (§6, §8.1). Rien ici ne sera repris
tel quel ; seuls les dumps et `NOTES.md` survivent.

## Mise en route

```bash
cp recon/.env.example recon/.env    # puis remplir WCL_CLIENT_ID / SECRET / TEST_REPORT
```

Credentials : https://www.warcraftlogs.com/api/clients/ (créer un client, noter l'id et le
secret ; déclarer `http://localhost:4477/callback` en Redirect URI pour l'étape 06).

## Étapes, dans l'ordre

```bash
node --env-file=recon/.env recon/00-zones.mjs           # auth + table encounterID → nom
node --env-file=recon/.env recon/01-fights.mjs          # fight de run vs fights de boss
node --env-file=recon/.env recon/02-playerdetails.mjs   # roster + pets
node --env-file=recon/.env recon/03-events.mjs          # volume, structure, coût
node --env-file=recon/.env recon/04-filter-test.mjs     # non-régression du filterExpression
node --env-file=recon/.env recon/05-combatantinfo.mjs   # format des talents
node --env-file=recon/.env recon/06-user-token.mjs      # budget sous token utilisateur
```

Chaque script accepte l'URL ou le code de rapport en argument, sinon lit `WCL_TEST_REPORT`.
Les étapes 03/04/05 réutilisent le dump de 01 pour ne pas repayer la requête `fights`.

Après l'étape 00, renseigner `WCL_ZONE_ID` dans `.env` et relancer 00 pour figer la table
`encounterID → nom`.

## Garde-fous déjà en place

- `rateLimitData` est injecté dans **toute** query par `wcl.mjs` — impossible de l'oublier.
- Le coût est mesuré en delta de `pointsSpentThisHour` entre deux requêtes, jamais estimé.
- La pagination s'arrête sur curseur non progressif, sur 20 pages, et à 80 % du budget.

## Sortie attendue

`dumps/*.json` + un `NOTES.md` rempli. Le critère de sortie est dans `NOTES.md` :
tant qu'une ligne du tableau porte ❓, la Phase 1 n'est pas ouverte.

⚠️ La validation croisée manuelle (compter un sort sur le site WCL et comparer à l'API)
n'est pas scriptable et n'est pas optionnelle : c'est le seul filet contre le pire mode
d'échec du système — zéro cast retourné, sans erreur.
