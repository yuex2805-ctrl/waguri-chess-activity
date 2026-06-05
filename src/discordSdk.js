import { DiscordSDK } from "@discord/embedded-app-sdk";

export async function initDiscordSdk() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

  if (!clientId) {
    return {
      ok: false,
      message: "Missing VITE_DISCORD_CLIENT_ID in .env."
    };
  }

  try {
    const discordSdk = new DiscordSDK(clientId);

    await discordSdk.ready();

    return {
      ok: true,
      message: "Discord SDK connected."
    };
  } catch (error) {
    console.warn("[DISCORD SDK]", error);

    return {
      ok: false,
      message: "Running outside Discord or SDK failed."
    };
  }
}