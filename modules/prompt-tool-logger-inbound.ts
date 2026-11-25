import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Text previews are capped so a large tool result (e.g. a full standings
// table) or a long answer doesn't bloat the logs.
const TOOL_RESULT_PREVIEW_CHARS = 500;
const ANSWER_PREVIEW_CHARS = 1000;

function preview(value: unknown, max: number): { chars: number; preview: string } {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return { chars: text.length, preview: text.length > max ? text.slice(0, max) + "…" : text };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  // Prefer the end-user sub copied by generic-set-user-context-inbound; fall
  // back to request.user in case this policy runs before it in the chain.
  const sub = context.custom.userSub ?? request.user?.sub;
  // Auth0 access tokens don't carry email by default; an Auth0 post-login
  // Action adds it under a namespaced claim (plain `email` as a fallback).
  const email = request.user?.data?.["https://baseball-ai-gateway/email"] ?? request.user?.data?.email;
  // baseball.js issues this per conversation (bound to the user's session
  // cookie) and also signs it into its MCP JWT, so it joins these logs with
  // the MCP server's tool-call logs.
  const conversationId = request.headers.get("x-conversation-id") ?? undefined;

  try {
    const body = await request.clone().json();
    const lastUserMessage = [...(body?.messages ?? [])].reverse().find((m: any) => m.role === "user");
    context.log.info(
      {
        sub,
        email,
        conversationId,
        model: body?.model,
        messageCount: body?.messages?.length ?? 0,
        prompt: lastUserMessage?.content,
      },
      "AI Gateway request prompt"
    );
    // Tool results this call sends forward: the role "tool" messages after
    // the last assistant message, i.e. what the MCP tools just returned.
    const messages: any[] = body?.messages ?? [];
    const trailing: any[] = [];
    for (let i = messages.length - 1; i >= 0 && messages[i]?.role === "tool"; i--) trailing.unshift(messages[i]);
    if (trailing.length) {
      context.log.info(
        {
          sub,
          email,
          conversationId,
          toolResults: trailing.map((m) => ({ name: m.name, toolCallId: m.tool_call_id, ...preview(m.content, TOOL_RESULT_PREVIEW_CHARS) })),
        },
        "AI Gateway request tool results"
      );
    }
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
            conversationId,
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
            conversationId,
            tools: toolCalls.map((t: any) => ({ name: t.function?.name, arguments: t.function?.arguments })),
          },
          "AI Gateway response tool calls"
        );
      }
      const choice = data?.choices?.[0];
      if (typeof choice?.message?.content === "string" && choice.message.content.length) {
        context.log.info(
          {
            sub,
            email,
            conversationId,
            model: data.model,
            finishReason: choice.finish_reason,
            answer: preview(choice.message.content, ANSWER_PREVIEW_CHARS),
          },
          "AI Gateway response answer"
        );
      }
    } catch (e) {
      context.log.warn(`prompt-tool-logger: failed to read response body: ${String(e)}`);
    }
    return response;
  });

  return request;
}
