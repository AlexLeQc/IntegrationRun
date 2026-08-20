import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_TEAMS = [
  "Schtroumpfettes Pompettes",
  "Passe-MontAngine de Poitrine",
  "Johnny Alcoo-Test",
  "Les Mélodibroues",
  "Garfeeling",
  "Loups-Guru",
  "Bubly Ponge",
  "Justin Bieberon",
  "Kabusch et les Krashpoils",
  "Arc'teryx et Obétwist",
  "Tequila Spies",
  "Buzzball chasseur",
  "Pabst Patrouille",
  "Homme sur Bière",
  "Clope penguin",
  "Pokérhum",
  "Pabst-Partout",
  "Teletobeerz",
  "Busch Lightyear",
  "Babush Ice",
  "GOUV",
  "CO",
];

// Maximum achievable score per second of gameplay (generous ceiling):
//   10 pts/sec survival + 100 pts/sec coins (1/sec) + ~83 pts/sec GOUV kills (1/3sec × 250)
// We use 250 pts/sec as a comfortable buffer above the real theoretical max.
const MAX_POINTS_PER_SECOND = 500;

// Minimum run duration in seconds — any score submitted for a run < 5s is rejected.
const MIN_RUN_DURATION_SEC = 10;

/**
 * Signs an arbitrary string payload using HMAC-SHA-256 with the given secret.
 * Returns the raw Base64-encoded signature.
 */
async function signPayload(
  payloadStr: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadStr),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verifies that a received signature matches what we would produce for the
 * given payload and secret.
 */
async function verifySignature(
  payloadStr: string,
  receivedSig: string,
  secret: string,
): Promise<boolean> {
  const expected = await signPayload(payloadStr, secret);
  return expected === receivedSig;
}

serve(async (req) => {
  // Handle CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // We use the service role key as the HMAC signing secret.
    // It is only available server-side, so the signature cannot be forged.
    const signingSecret = serviceRoleKey;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = body;

    // Extract requester metadata for security auditing
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // -------------------------------------------------------------------------
    // ACTION: start
    // Called when the player clicks JOUER (game starts).
    // Returns a signed session token containing a server-generated start time.
    // -------------------------------------------------------------------------
    if (action === "start") {
      const runId = crypto.randomUUID();
      const startTime = Date.now();
      const payloadStr = JSON.stringify({ runId, startTime });
      const signature = await signPayload(payloadStr, signingSecret);
      // Token format:  base64(payload) . base64(signature)
      const sessionToken = `${btoa(payloadStr)}.${signature}`;

      console.log(`[RUN_START] New session ${runId.slice(0, 8)} | IP: ${clientIp}`);

      return new Response(JSON.stringify({ success: true, sessionToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: submit
    // Called when the player submits their score after game over.
    // Validates the session token, anti-cheat rules, and inserts the score using
    // the service_role key (bypasses RLS; anon users cannot insert directly).
    // -------------------------------------------------------------------------
    if (action === "submit") {
      const { sessionToken, username, team, score } = body as {
        sessionToken?: string;
        username?: string;
        team?: string;
        score?: unknown;
      };

      // --- 1. Validate session token presence and format ---
      if (!sessionToken || typeof sessionToken !== "string") {
        console.warn(`[CHEAT_DETECTED] [MISSING_TOKEN] IP: ${clientIp} | Name: ${username}`);
        return new Response(
          JSON.stringify({ error: "Missing or invalid session token" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const dotIdx = sessionToken.indexOf(".");
      if (dotIdx === -1) {
        console.warn(`[CHEAT_DETECTED] [MALFORMED_TOKEN] IP: ${clientIp} | Name: ${username}`);
        return new Response(
          JSON.stringify({ error: "Malformed session token" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const payloadB64 = sessionToken.slice(0, dotIdx);
      const receivedSig = sessionToken.slice(dotIdx + 1);

      // --- 2. Verify cryptographic signature ---
      let payloadStr: string;
      try {
        payloadStr = atob(payloadB64);
      } catch {
        console.warn(`[CHEAT_DETECTED] [BAD_BASE64_TOKEN] IP: ${clientIp}`);
        return new Response(
          JSON.stringify({ error: "Malformed session token (bad base64)" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const valid = await verifySignature(
        payloadStr,
        receivedSig,
        signingSecret,
      );
      if (!valid) {
        console.warn(`[CHEAT_DETECTED] [FORGED_SIGNATURE] IP: ${clientIp} | Name: ${username}`);
        return new Response(
          JSON.stringify({ error: "Invalid session token signature" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- 3. Extract and validate timing from token ---
      let startTime: number;
      let runId = "unknown";
      try {
        const parsed = JSON.parse(payloadStr) as {
          runId: string;
          startTime: number;
        };
        startTime = parsed.startTime;
        runId = parsed.runId;
      } catch {
        console.warn(`[CHEAT_DETECTED] [BAD_PAYLOAD_JSON] IP: ${clientIp}`);
        return new Response(
          JSON.stringify({ error: "Malformed session token payload" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const serverNow = Date.now();
      const durationSec = Math.max(
        0,
        Math.floor((serverNow - startTime) / 1000),
      );

      if (durationSec < MIN_RUN_DURATION_SEC) {
        console.warn(
          `[CHEAT_DETECTED] [RUN_TOO_SHORT] ${durationSec}s (< ${MIN_RUN_DURATION_SEC}s) | IP: ${clientIp} | Name: ${username} | Score: ${score}`,
        );
        return new Response(
          JSON.stringify({
            error: `Run too short (${durationSec}s). Minimum is ${MIN_RUN_DURATION_SEC}s.`,
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- 4. Validate username ---
      const cleanUsername = (username ?? "")
        .toString()
        .toUpperCase()
        .trim()
        .slice(0, 12);
      if (!cleanUsername || cleanUsername.length < 2) {
        console.warn(`[REJECTED] [INVALID_USERNAME] "${username}" | IP: ${clientIp}`);
        return new Response(
          JSON.stringify({
            error: "Invalid username (must be 2–12 characters)",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- 5. Validate team ---
      if (!team || !VALID_TEAMS.includes(team)) {
        console.warn(`[REJECTED] [INVALID_TEAM] "${team}" | IP: ${clientIp}`);
        return new Response(
          JSON.stringify({ error: "Invalid or unrecognized team" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- 6. Validate score ---
      const safeScore = Math.floor(Number(score));
      if (!Number.isFinite(safeScore) || safeScore <= 0) {
        console.warn(`[REJECTED] [INVALID_SCORE] "${score}" | IP: ${clientIp}`);
        return new Response(JSON.stringify({ error: "Invalid score value" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate efficiency: points per second
      const ptsPerSec = (safeScore / Math.max(1, durationSec)).toFixed(1);
      const isSuspiciousRate = Number(ptsPerSec) > 300;

      // --- 7. Anti-cheat: physical plausibility ceiling ---
      // Score must be achievable within the server-measured real elapsed time.
      const maxTheoretical = durationSec * MAX_POINTS_PER_SECOND + 500;
      if (safeScore > maxTheoretical) {
        console.warn(
          `[CHEAT_DETECTED] [IMPLAUSIBLE_SCORE] ${safeScore} pts in ${durationSec}s (${ptsPerSec} pts/s, max allowed ${maxTheoretical}) | IP: ${clientIp} | Name: ${cleanUsername}`,
        );
        return new Response(
          JSON.stringify({
            error: `Score implausible: ${safeScore} pts in ${durationSec}s exceeds maximum possible score.`,
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // --- 8. Insert using the service_role client (bypasses RLS) ---
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      const { error: insertError } = await supabaseAdmin
        .from("high_scores")
        .insert([
          {
            username: cleanUsername,
            team,
            score: safeScore,
            run_duration_sec: durationSec,
            created_at: new Date().toISOString(),
            is_top_score: false, // trimming / rank computed separately
          },
        ]);

      if (insertError) {
        console.error("[game-score] Insert failed:", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Diagnostic audit log for accepted score
      console.log(
        `[SCORE_SUBMIT] ${isSuspiciousRate ? "[SUSPECT_HIGH_RATE]" : "[ACCEPTED]"} | ` +
          `Player: ${cleanUsername} | Team: ${team} | Score: ${safeScore} | ` +
          `Time: ${durationSec}s (${ptsPerSec} pts/s) | IP: ${clientIp} | Run: ${runId.slice(0, 8)}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          username: cleanUsername,
          team,
          score: safeScore,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[game-score] Unhandled error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
