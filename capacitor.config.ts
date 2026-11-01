import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.uricorn.contractiontimer",
  appName: "Contraction Timer",
  webDir: "dist",
  android: { allowMixedContent: false },
};

export default config;
