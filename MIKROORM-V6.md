# Pourquoi MikroORM 6 et non 7

`@mikro-orm/*@7.x` déclare `engines: { node: ">= 22.17.0" }`. Cette machine tourne en
Node 20.19.4, et Node 20 est la ligne retenue pour le projet. npm rétrograde donc
automatiquement en 6.6.16 — les dépendances sont **épinglées en `~6.6.16`** pour rendre ce
choix explicite plutôt que subi.

Autre différence de fond : la v7 remplace knex par kysely en interne. Ce n'est pas un
changement à subir en cours de route.

**Pour passer en v7 un jour** : monter en Node 22.17+ (ou 24 LTS), puis relever les pins.
