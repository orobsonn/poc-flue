export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

/** @description Envia mensagem texto pra chat. Não retry — log e segue se falhar. */
export async function sendTelegramAlert(
  cfg: TelegramConfig,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      return { ok: false, error: `Telegram ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
