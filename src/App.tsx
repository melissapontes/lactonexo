import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AvisoAtualizacao } from './components/AvisoAtualizacao';
import { BarraStatus } from './components/BarraStatus';
import { Onboarding } from './components/Onboarding';
import { pedirPersistencia } from './lib/armazenamento';
import { iniciarGatilhos } from './sync/motor';
import { Configuracoes } from './pages/Configuracoes';
import { Inicio } from './pages/Inicio';

export function App() {
  useEffect(() => {
    void pedirPersistencia();
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
          <Route path="*" element={<Inicio />} />
        </Routes>
      </Onboarding>
    </BrowserRouter>
  );
}
