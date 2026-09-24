import crypto from "node:crypto";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8080);
const maxClockSkewSeconds = 300;
const store = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "var");

function reply(response, status, body) {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
  });
  response.end(json);
}

function safeEqual(expected, supplied) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function alreadyProcessed(eventId) {
  const file = join(store, `${eventId.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
  try {
    await readFile(file);
    return { duplicate: true, file };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { duplicate: false, file };
  }
}

const server = http.createServer((request, response) => {
  if (request.method !== "POST") {
    reply(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const secret = process.env.SMSMOBILEAPI_WEBHOOK_SECRET || "";
  if (!secret) {
    reply(response, 500, { ok: false, error: "webhook_secret_not_configured" });
    return;
  }

  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > 1_000_000) request.destroy();
    else chunks.push(chunk);
  });
  request.on("end", async () => {
    try {
      const raw = Buffer.concat(chunks);
      const timestamp = request.headers["x-smsmobileapi-timestamp"] || "";
      const supplied = request.headers["x-smsmobileapi-signature"] || "";
      if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > maxClockSkewSeconds) {
        reply(response, 401, { ok: false, error: "invalid_or_stale_timestamp" });
        return;
      }

      const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex")}`;
      if (!safeEqual(expected, supplied)) {
        reply(response, 401, { ok: false, error: "invalid_signature" });
        return;
      }

      const event = JSON.parse(raw.toString("utf8"));
      if (!event.id || !event.type || typeof event.data !== "object") {
        reply(response, 400, { ok: false, error: "invalid_event_envelope" });
        return;
      }

      await mkdir(store, { recursive: true, mode: 0o700 });
      const state = await alreadyProcessed(String(event.id));
      if (state.duplicate) {
        reply(response, 200, { ok: true, duplicate: true });
        return;
      }
      await writeFile(state.file, raw, { flag: "wx", mode: 0o600 });

      console.log(`accepted ${event.type} ${event.id}`);
      reply(response, 202, { ok: true, accepted: true });
    } catch (error) {
      console.error(error);
      reply(response, 400, { ok: false, error: "invalid_request" });
    }
  });
});

server.listen(port, host, () => console.log(`Listening on http://${host}:${port}`));
