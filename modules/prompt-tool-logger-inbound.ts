import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  // Prefer the end-user sub copied by generic-set-user-context-inbound; fall
  // back to request.user in case this policy runs before it in the chain.
  const sub = context.custom.userSub ?? request.user?.sub;
  // Auth0 access tokens don't carry email by default; an Auth0 post-login
  // Action adds it under a namespaced claim (plain `email` as a fallback).
  const email = request.user?.data?.["https://baseball-ai-gateway/email"] ?? request.user?.data?.email;

  try {
    const body = await request.clone().json();
    const lastUserMessage = [...(body?.messages ?? [])].reverse().find((m: any) => m.role === "user");
    context.log.info(
      {
        sub,
        email,
        model: body?.model,
        messageCount: body?.messages?.length ?? 0,
        prompt: lastUserMessage?.content,
      },
      "AI Gateway request prompt"
    );
  } catch (e) {
    context.log.warn(`prompt-tool-logger: failed to read request body: ${String(e)}`);
  }

  context.addResponseSendingHook(async (response) => {
    if (!response.ok) return response;
    // Streamed responses aren't JSON; usage only arrives in the final SSE chunk.
    if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) return response;
    try {
      const data = await response.clone().json();
      if (data?.usage) {
        context.log.info(
          {
            sub,
            email,
            model: data.model,
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          },
          "AI Gateway response token usage"
        );
      }
      const toolCalls = data?.choices?.[0]?.message?.tool_calls;
      if (toolCalls?.length) {
        context.log.info(
          {
            sub,
            email,
            tools: toolCalls.map((t: any) => ({ name: t.function?.name, arguments: t.function?.arguments })),
          },
          "AI Gateway response tool calls"
        );
      }
    } catch (e) {
      context.log.warn(`prompt-tool-logger: failed to read response body: ${String(e)}`);
    }
    return response;
  });

  return request;
}
