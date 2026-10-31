import { subscribe } from "@/lib/live";

export async function GET(req: Request) {
  const enc = new TextEncoder();
  let unsub: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch {} };
      send("retry: 3000\n\n"); // browser reconnects after 3 seconds if dropped
      unsub = await subscribe((m) => send(`data: ${JSON.stringify(m)}\n\n`));
      ping = setInterval(() => send(": keep-alive\n\n"), 20000); // stops proxies closing an idle connection
      req.signal.addEventListener("abort", () => { unsub?.(); if (ping) clearInterval(ping); try { controller.close(); } catch {} });
    },
    cancel() { unsub?.(); if (ping) clearInterval(ping); },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}