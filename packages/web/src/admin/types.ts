/** Miroir du registre serveur (`packages/api/src/admin/resources.ts`). */

export type FieldKind =
  | 'integer' | 'string' | 'text' | 'boolean' | 'date' | 'enum' | 'json' | 'int-array' | 'relation';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  label: string;
  pk?: boolean;
  generated?: boolean;
  required?: boolean;
  readonly?: boolean;
  listed?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  heavy?: boolean;
  enumValues?: string[];
  choices?: { value: number | string; label: string }[];
  target?: string;
  maxLength?: number;
  help?: string;
}

export interface ResourceSchema {
  key: string;
  table: string;
  label: string;
  labelPlural: string;
  pivot: boolean;
  pk: string[];
  defaultSort: { field: string; order: 'asc' | 'desc' };
  description: string | null;
  fields: FieldDef[];
}

/** Une ligne sérialisée : les champs de l'entité, plus l'id encodé et son libellé. */
export type Row = Record<string, unknown> & { __id: string; __label: string };

/** `{ champ: { idEncodé: libellé } }` — résolu côté serveur pour éviter N requêtes. */
export type Refs = Record<string, Record<string, string>>;

export interface ListResult {
  rows: Row[];
  total: number;
  page: number;
  perPage: number;
  refs: Refs;
}

export interface Stat {
  key: string;
  label: string;
  pivot: boolean;
  count: number;
}

export interface Option {
  value: string;
  label: string;
}
