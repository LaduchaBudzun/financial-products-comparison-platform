import { getContainer } from "./infrastructure/container.js";
import { errorResponse, jsonResponse, noContentResponse } from "./core/http.js";
import { NotFoundError } from "./core/errors.js";
import { productsHandler } from "./handlers/productsHandler.js";
import { compareHandler } from "./handlers/compareHandler.js";
import { recommendationsHandler } from "./handlers/recommendationsHandler.js";

function requestOriginFromEvent(event) {
  return event?.headers?.origin || event?.headers?.Origin || "";
}

function resolveRoute(event) {
  const method = String(event?.httpMethod || "").toUpperCase();
  const path = String(event?.path || "");
  const resource = String(event?.resource || event?.requestContext?.resourcePath || "");

  if (method === "GET" && (resource === "/products/{category}" || /^\/products\/[^/]+$/i.test(path))) {
    return "GET_PRODUCTS";
  }
  if (method === "POST" && (resource === "/compare" || path.endsWith("/compare"))) {
    return "POST_COMPARE";
  }
  if (method === "GET" && (resource === "/recommendations" || path.endsWith("/recommendations"))) {
    return "GET_RECOMMENDATIONS";
  }
  if (method === "OPTIONS") {
    return "OPTIONS";
  }
  return "NOT_FOUND";
}

export async function handler(event, context) {
  const container = getContainer();
  const requestOrigin = requestOriginFromEvent(event);
  const requestId = context?.awsRequestId || "local";
  const responseOptions = {
    requestOrigin,
    allowedOrigins: container.env.allowedOrigins,
    requestId
  };

  container.logger.info("Incoming request", {
    requestId,
    method: event?.httpMethod,
    path: event?.path
  });

  const route = resolveRoute(event);
  if (route === "OPTIONS") {
    return noContentResponse(responseOptions);
  }

  try {
    let payload;
    if (route === "GET_PRODUCTS") {
      payload = await productsHandler({ event, services: container.services });
    } else if (route === "POST_COMPARE") {
      payload = await compareHandler({ event, services: container.services });
    } else if (route === "GET_RECOMMENDATIONS") {
      payload = await recommendationsHandler({ event, services: container.services });
    } else {
      throw new NotFoundError("Route not found");
    }

    return jsonResponse(200, payload, responseOptions);
  } catch (error) {
    container.logger.error("Request failed", {
      requestId,
      message: error.message,
      stack: error.stack
    });
    return errorResponse(error, responseOptions);
  }
}
