import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ouvirMotor, type EstadoMotor } from './motor';

/**
 * Online/Offline. Além dos eventos, relê navigator.onLine ao voltar o foco e a cada poucos segundos:
 * o Safari/WebKit às vezes não dispara "online" (ex.: página aberta sem rede pelo service worker),
 * e a barra ficaria presa em "Offline".
 */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const conferir = () => setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('focus', conferir);
    document.addEventListener('visibilitychange', conferir);
    const t = setInterval(conferir, 3000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('focus', conferir);
      document.removeEventListener('visibilitychange', conferir);
      clearInterval(t);
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
