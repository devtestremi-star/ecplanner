import { useEffect, useState } from 'react';
import { api } from './api.js';
import type { ResourceSchema } from './types.js';

let cache: ResourceSchema[] | null = null;
const subscribers = new Set<(s: ResourceSchema[]) => void>();

/** Le schéma des 9 tables, chargé une fois puis partagé par tous les composants. */
export function useAllSchemas(): ResourceSchema[] | null {
  const [schemas, setSchemas] = useState<ResourceSchema[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    subscribers.add(setSchemas);
    api.schema().then((s) => {
      cache = s;
      for (const fn of subscribers) fn(s);
    }).catch(() => undefined);
    return () => { subscribers.delete(setSchemas); };
  }, []);

  return schemas;
}

export function useSchema(key: string): ResourceSchema | null {
  return useAllSchemas()?.find((s) => s.key === key) ?? null;
}
