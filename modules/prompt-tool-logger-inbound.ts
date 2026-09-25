import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  try {
    const body = await request.clone().json();
    const lastUserMessage = [...(body?.messages ?? [])].reverse().find((m: any) => m.role === "user");
    context.log.info(
      {
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
    try {
      const data = await response.clone().json();
      const toolCalls = data?.choices?.[0]?.message?.tool_calls;
      if (toolCalls?.length) {
        context.log.info(
          {
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
