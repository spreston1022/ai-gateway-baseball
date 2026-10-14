import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const BLOCKED_PHRASE = /\bi\s+am\s+god\b/i;

function blocked(): Response {
  return new Response(
    JSON.stringify({
      type: "https://httpproblems.com/http-status/400",
      title: "Bad Request",
      status: 400,
      detail:
        "Your message was blocked by a content policy. Please rephrase and try again.",
    }),
    { status: 400, headers: { "content-type": "application/problem+json" } }
  );
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ");
  }
  return "";
}

// Only the latest user message is checked, so a blocked prompt left in the
// chat history doesn't block every later request in the conversation.
export default async function (request: ZuploRequest, context: ZuploContext) {
  try {
    const body = await request.clone().json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    if (lastUser && BLOCKED_PHRASE.test(contentText(lastUser.content))) {
      context.log.warn("Blocked request: prompt matched blocked phrase");
      return blocked();
    }
  } catch (e) {
    context.log.warn(`god-block: failed to read request body: ${String(e)}`);
  }
  return request;
}
