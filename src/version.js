// Versione dell'app iniettata da Vite (vite.config.js) leggendo package.json
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
