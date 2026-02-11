const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;

    // sanity
    if (path === "/health") {
      return json({ ok: true, service: "gym-api" });
    }

    // Start a session (server generates session_id)
    // POST /start  -> { session_id, started_at }
    if (path === "/start" && request.method === "POST") {
      const session_id = crypto.randomUUID();
      const started_at = new Date().toISOString();

      await env.gym_db
        .prepare(
          `INSERT INTO gym_sessions (session_id, started_at)
           VALUES (?, ?)`
        )
        .bind(session_id, started_at)
        .run();

      return json({ ok: true, session_id, started_at });
    }

    // End a session
    // POST /end  body: { session_id } -> { ended_at, duration_sec }
    if (path === "/end" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Expected JSON body" }, 400);
      }

      const session_id = (body.session_id || "").trim();
      if (!session_id) return json({ ok: false, error: "session_id is required" }, 400);

      const row = await env.gym_db
        .prepare(`SELECT started_at, ended_at FROM gym_sessions WHERE session_id = ?`)
        .bind(session_id)
        .first();

      if (!row) return json({ ok: false, error: "Session not found" }, 404);
      if (row.ended_at) return json({ ok: false, error: "Session already ended" }, 409);

      const ended_at = new Date().toISOString();
      const duration_sec = Math.max(
        0,
        Math.floor((Date.parse(ended_at) - Date.parse(row.started_at)) / 1000)
      );

      await env.gym_db
        .prepare(
          `UPDATE gym_sessions
           SET ended_at = ?, duration_sec = ?
           WHERE session_id = ?`
        )
        .bind(ended_at, duration_sec, session_id)
        .run();

      return json({ ok: true, session_id, ended_at, duration_sec });
    }

// Stats
// - GET /stats?mode=hour_of_day  -> [{ hour: 0..23, starts: N }]  (ALL-TIME)
// - GET /stats?hours=24          -> [{ hour: "YYYY-MM-DDTHH:00Z", starts: N }] (recent)
if (path === "/stats" && request.method === "GET") {
  const mode = (url.searchParams.get("mode") || "").trim();

  // ✅ FOREVER MODE: all-time hour-of-day counts (0..23)
  if (mode === "hour_of_day") {
    const res = await env.gym_db
      .prepare(
        `
        SELECT
          CAST(strftime('%H', started_at) AS INTEGER) AS hour,
          COUNT(*) AS starts
        FROM gym_sessions
        WHERE started_at IS NOT NULL
        GROUP BY hour
        ORDER BY hour ASC
        `
      )
      .all();

    return json({ ok: true, mode: "hour_of_day", rows: res.results || [] });
  }

  // existing recent-hours mode (keep this as fallback)
  const hours = Math.min(168, Math.max(1, parseInt(url.searchParams.get("hours") || "24", 10)));

  const res = await env.gym_db
    .prepare(
      `
      WITH recent AS (
        SELECT started_at
        FROM gym_sessions
        WHERE started_at >= datetime('now', '-' || ? || ' hours')
      )
      SELECT
        strftime('%Y-%m-%dT%H:00Z', started_at) AS hour,
        COUNT(*) AS starts
      FROM recent
      GROUP BY hour
      ORDER BY hour ASC
      `
    )
    .bind(hours)
    .all();

  return json({ ok: true, hours, rows: res.results || [] });
}

    return new Response("Not found", { status: 404, headers: cors });
  },
};
