// Fumigation : la config se charge, la connexion passe, les entités sont découvertes.
import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config.js';

const orm = await MikroORM.init(config);
const rows = await orm.em.getConnection().execute<Array<{ version: string }>>('select version()');
console.log('✅ Postgres :', rows[0]?.version.split(',')[0] ?? '?');
console.log('✅ Entités  :', Object.keys(orm.getMetadata().getAll()).join(', '));
console.log('✅ DDL généré depuis les entités :\n');
console.log(await orm.schema.getCreateSchemaSQL());
await orm.close();
