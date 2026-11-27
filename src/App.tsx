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

export function App() {
  useEffect(() => {
    void pedirPersistencia();
    void garantirCatalogo();
    return iniciarGatilhos();
  }, []);

  return (
    <BrowserRouter>
      <Onboarding>
        <BarraStatus />
        <AvisoAtualizacao />
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/propriedades/:id" element={<Propriedade />} />
          <Route path="/animais/:id" element={<Animal />} />
          <Route path="/visitas/:id" element={<Visita />} />
          <Route path="/visitas/:id/animal/:va" element={<AnimalVisita />} />
          <Route path="/visitas/:id/laboratorio" element={<Laboratorio />} />
          <Route path="/visitas/:id/resumo" element={<Resumo />} />
          <Route path="*" element={<Inicio />} />
        </Routes>
      </Onboarding>
    </BrowserRouter>
  );
}
