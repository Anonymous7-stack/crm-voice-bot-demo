export async function POST(req: Request) {
  const body = await req.json();

  const response = await fetch(
    process.env.NEXT_PUBLIC_CALL_START_WEBHOOK_URL!,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  return Response.json(data);
}