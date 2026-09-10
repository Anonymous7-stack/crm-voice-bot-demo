export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_CALL_START_WEBHOOK_URL;

  if (!url) {
    return Response.json({ error: "ENV NEXT_PUBLIC_CALL_START_WEBHOOK_URL fehlt" }, { status: 500 });
  }

  try {
    const body = await req.json();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    if (!res.ok) {
      return Response.json({ error: "n8n Fehler", status: res.status, body: text }, { status: 502 });
    }

    try {
      return Response.json(JSON.parse(text));
    } catch {
      return Response.json({ raw: text });
    }
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}