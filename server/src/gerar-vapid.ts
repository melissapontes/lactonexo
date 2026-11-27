import webpush from 'web-push';

// Gera um par de chaves VAPID. Guarde a privada como segredo do servidor.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLICA=${publicKey}\nVAPID_PRIVADA=${privateKey}`);
