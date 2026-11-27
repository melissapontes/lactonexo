import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AvisoAtualizacao } from './components/AvisoAtualizacao';
import { BarraStatus } from './components/BarraStatus';
import { Onboarding } from './components/Onboarding';
import { pedirPersistencia } from './lib/armazenamento';
import { iniciarGatilhos } from './sync/motor';
import { Configuracoes } from './pages/Configuracoes';
import { Inicio } from './pages/Inicio';
import { Propriedade } from './pages/Propriedade';
import { Animal } from './pages/Animal';
import { Visita } from './pages/visita/Visita';
import { AnimalVisita } from './pages/visita/AnimalVisita';
import { Laboratorio } from './pages/visita/Laboratorio';
import { Resumo } from './pages/visita/Resumo';
import { garantirCatalogo } from './modules/mastite/dados';
import { Entrar } from './pages/Entrar';
import { Conflitos } from './pages/Conflitos';
import { Painel } from './pages/Painel';
import { garantirRegras } from './modules/mastite/regras';
import { API_URL } from './sync/sessao';
import { transporteHttp } from './sync/http';
import { configurarTransporte } from './sync/transporte';
import { sincronizar } from './sync/motor';
import { useSessao } from './sync/useSessao';

export function App() {
  const sessao = useSessao();
  useEffect(() => {
    void pedirPersistencia();
    void garantirCatalogo();
    void garantirRegras();
    return iniciarGatilhos();
  }, []);
  useEffect(() => {
    // Com servidor configurado, sincroniza só com sessão; sem servidor, o app funciona só no aparelho.
    configurarTransporte(API_URL && sessao ? transporteHttp : null);
    if (API_URL && sessao) void sincronizar();
  }, [sessao]);

  if (API_URL && sessao === undefined) return null;

  return (
    <BrowserRouter>
      <Onboarding>
        {API_URL && !sessao ? (
          <Entrar />
        ) : (
          <>
        <BarraStatus />
        <AvisoAtualizacao />
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/propriedades/:id" element={<Propriedade />} />
          <Route path="/propriedades/:id/painel" element={<Painel />} />
          <Route path="/animais/:id" element={<Animal />} />
          <Route path="/visitas/:id" element={<Visita />} />
          <Route path="/visitas/:id/animal/:va" element={<AnimalVisita />} />
          <Route path="/visitas/:id/laboratorio" element={<Laboratorio />} />
          <Route path="/visitas/:id/resumo" element={<Resumo />} />
          <Route path="/conflitos" element={<Conflitos />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
          </>
        )}
      </Onboarding>
    </BrowserRouter>
  );
}
