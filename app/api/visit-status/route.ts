export const runtime = "nodejs";

export async function POST(req: Request) {
  const base = process.env.NEXT_PUBLIC_VISIT_STATUS_WEBHOOK_URL;

  if (!base) {
    return Response.json({ error: "ENV NEXT_PUBLIC_VISIT_STATUS_WEBHOOK_URL fehlt" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const visitId = String(body?.visit_id ?? "").trim();

    if (!visitId) {
      return Response.json({ error: "visit_id fehlt" }, { status: 400 });
    }

    const url = `${base}?visit_id=${encodeURIComponent(visitId)}`;

    const res = await fetch(url, { method: "GET" });

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