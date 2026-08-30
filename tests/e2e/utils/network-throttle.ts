import type { CDPSession, Page } from "@playwright/test";

// Perfil "Slow 3G" (research.md #12), valores del preset estándar de Chrome DevTools.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (500 * 1024) / 8,
  uploadThroughput: (500 * 1024) / 8,
  latency: 400,
};

// Gama baja: CPU 4x más lenta que la máquina de test (research.md #12).
const CPU_THROTTLE_RATE = 4;

export async function throttleToSlow3GLowEnd(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", SLOW_3G);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  return client;
}
