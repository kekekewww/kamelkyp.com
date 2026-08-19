type PublicErrorLocale = "zh" | "en";

const publicMessages: Record<PublicErrorLocale, string> = {
  zh: "目前無法完成這項操作，請稍後再試。",
  en: "This action is temporarily unavailable. Please try again later.",
};

export function publicErrorResponse({
  status,
  code,
  locale,
  requestId,
}: {
  status: number;
  code: string;
  locale: PublicErrorLocale;
  requestId: string;
  error?: unknown;
}): Response {
  return Response.json(
    {
      error: {
        code,
        message: publicMessages[locale],
        requestId,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    },
  );
}

export function safeErrorLog({
  code,
  requestId,
  route,
}: {
  code: string;
  requestId: string;
  route: string;
}): void {
  console.error(JSON.stringify({ code, requestId, route }));
}
