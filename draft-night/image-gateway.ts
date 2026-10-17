// Draft Night 2.0 image gateway (Railway Function, draft-night project).
// Holds the only copy of OPENAI_API_KEY (a same-project reference to
// draft-night-web). Dobble-app calls it with a shared bearer token, so the
// OpenAI key is never copied to, or readable from, the site service.
const ID = /^[A-Z0-9]{6}:\d+:image:[01]$/;
const used = new Set<string>();
let day = "";
let count = 0;
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json" },
  });
export async function handle(
  req: Request,
  env: Record<string, string | undefined>,
  call = fetch,
): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/health") return json({ ok: true, today: count });
  if (req.method !== "POST" || url.pathname !== "/images")
    return json({ error: "not found" }, 404);
  const token = env.IMAGE_GATEWAY_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`)
    return json({ error: "unauthorised" }, 401);
  if (!env.OPENAI_API_KEY) return json({ error: "not configured" }, 503);
  const text = await req.text();
  if (text.length > 20000) return json({ error: "too large" }, 413);
  let b: any;
  try {
    b = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  if (
    !b ||
    typeof b.id !== "string" ||
    !ID.test(b.id) ||
    typeof b.prompt !== "string" ||
    b.prompt.length < 20 ||
    b.prompt.length > 6000
  )
    return json({ error: "bad request" }, 400);
  const quality = ["low", "medium", "high"].includes(b.quality)
    ? b.quality
    : "medium";
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    count = 0;
    used.clear();
  }
  const max = Number(env.IMAGE_GATEWAY_DAILY_MAX) || 200;
  if (used.has(b.id)) return json({ error: "already requested" }, 409);
  if (count >= max) return json({ error: "daily limit" }, 429);
  used.add(b.id);
  count++;
  const res = await call("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      n: 1,
      size: "1024x1024",
      quality,
      output_format: "webp",
      prompt: b.prompt,
    }),
    signal: AbortSignal.timeout(140000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let why = "";
    try {
      const e = JSON.parse(detail).error;
      why = `${e?.type ?? ""} ${e?.code ?? ""} ${String(e?.message ?? "").slice(0, 200)}`;
    } catch {}
    console.error(`[gateway] ${b.id} openai status ${res.status} ${why}`);
    return json({ error: "provider failed" }, 502);
  }
  const out: any = await res.json();
  console.log(`[gateway] ${b.id} ok`);
  return json({
    data: [{ b64_json: out?.data?.[0]?.b64_json }],
    usage: out?.usage ?? null,
  });
}
export default { fetch: (req: Request) => handle(req, Bun.env as any) };
