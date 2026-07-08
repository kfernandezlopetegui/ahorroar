import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // appId se mantiene para no romper builds Android existentes;
  // cambiarlo requiere regenerar el proyecto nativo.
  appId: 'io.ionic.starter',
  appName: 'Preciosos',
  webDir: 'www'
};

export default config;
