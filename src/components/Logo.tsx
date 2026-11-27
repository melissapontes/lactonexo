import { APP } from '../config/app';

/** Logo provisório, lido de um único arquivo (public/logo.svg). */
export function Logo({ tamanho = 32 }: { tamanho?: number }) {
  return <img src={APP.logo} width={tamanho} height={tamanho} alt="" aria-hidden="true" style={{ borderRadius: tamanho / 4.5 }} />;
}
