import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b/;

function blocked(): Response {
  return new Response(
    JSON.stringify({
      type: "https://httpproblems.com/http-status/400",
      title: "Bad Request",
      status: 400,
      detail: "Request content appears to contain a Social Security Number and was blocked.",
    }),
    { status: 400, headers: { "content-type": "application/problem+json" } }
  );
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  try {
    const body = await request.clone().json();
    const text = JSON.stringify(body?.messages ?? "");
    if (SSN_PATTERN.test(text)) {
      context.log.warn("Blocked request: content matched SSN pattern");
      return blocked();
    }
  } catch (e) {
    context.log.warn(`ssn-block: failed to read request body: ${String(e)}`);
  }
  return request;
}
