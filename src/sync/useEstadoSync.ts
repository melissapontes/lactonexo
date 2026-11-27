import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ouvirMotor, type EstadoMotor } from './motor';

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useEstadoSync() {
  const online = useOnline();
  const pendentes = useLiveQuery(() => db.fila_ops.where('status').anyOf('pendente', 'enviando').count(), [], 0);
  const rejeitadas = useLiveQuery(() => db.fila_ops.where('status').equals('rejeitada').count(), [], 0);
  const maisAntiga = useLiveQuery(
    () => db.fila_ops.where('status').anyOf('pendente', 'enviando').first().then((o) => o?.criada_em ?? null),
    [],
    null,
  );
  const conflitos = useLiveQuery(() => db.conflito.filter((c) => c.status === 'pendente' && !c.excluido_em).count(), [], 0);
  const ultimaSync = useLiveQuery(() => db.meta.get('ultima_sync').then((m) => (m?.valor as string) ?? null), [], null);
  const [motor, setMotor] = useState<EstadoMotor>({ sincronizando: false, ultimoResultado: null });
  useEffect(() => {
    const parar = ouvirMotor(setMotor);
    return () => {
      parar();
    };
  }, []);
  return { online, pendentes, rejeitadas, maisAntiga, ultimaSync, conflitos, ...motor };
}
