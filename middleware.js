// Controllo accessi con codice (come in Slot Car): il runtime Node serve per crypto e Redis REST.
import accessMiddleware from './server/access-middleware.mjs';

export const config = { runtime: 'nodejs' };

export default async function middleware(request) {
  return accessMiddleware(request);
}
