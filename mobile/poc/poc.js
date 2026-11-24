// Bundled-UI sign-in spike (docs/IOS_RELEASE.md). Results are shown on screen and logged as short
// codes; no token, code or email is ever logged or shown.
(function () {
  var C = window.POC_CONFIG || {};
  var list = document.getElementById("checks");
  function row(id, title) {
    var li = document.getElementById(id) || document.createElement("li");
    li.id = id; li.className = "wait"; li.innerHTML = "<b></b><span>running…</span>";
    li.querySelector("b").textContent = title; list.appendChild(li); return li;
  }
  function done(li, ok, detail) {
    li.className = ok ? "pass" : "fail"; li.querySelector("span").textContent = detail;
    console.log("[poc] " + li.id + " " + (ok ? "pass" : "fail") + " " + detail);
  }
  function b64url(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  var errCode = function (e) { return e ? (e.code || e.status || e.name || "error") : "none"; };

  done(row("origin", "Page origin"), location.protocol === "capacitor:", location.origin);

  // Session kept in the app's own storage for this origin.
  var client = window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "poc-auth", detectSessionInUrl: false } });
  var sess = row("session", "Session restored after relaunch");
  client.auth.getSession().then(function (r) {
    var s = r.data.session;
    done(sess, true, s ? "signed in · expires " + new Date(s.expires_at * 1000).toLocaleTimeString() : "no session");
  });

  // 1 · The check, on our real domain, in Apple's auth sheet.
  var checkToken = null, usedCheckToken = null;
  var WebAuth = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WebAuth;
  document.getElementById("check").onclick = function () {
    var li = row("bridge", "Check bridge (hosted Turnstile → app)");
    var state = b64url(crypto.getRandomValues(new Uint8Array(32)));
    var host = new URL(C.apiBase).host;
    WebAuth.start({ url: C.apiBase + "/app/check?state=" + state, allowedHost: host })
      .then(function (r) {
        var u = new URL(r.url);
        var p = new URLSearchParams(u.hash.replace(/^#/, ""));
        if (u.protocol !== "whattoeat-auth:") return done(li, false, "wrong scheme");
        if (p.get("state") !== state) return done(li, false, "state mismatch — dropped");
        var t = p.get("token");
        if (!t || !/^[A-Za-z0-9._-]{20,2048}$/.test(t)) return done(li, false, "malformed token");
        checkToken = t;
        done(li, true, "token received for this state (" + t.length + " chars)");
      })
      .catch(function (e) { done(li, false, "sheet: " + errCode(e)); });
  };

  // 2 · Send the code from the bundled origin with the hosted check's token.
  document.getElementById("send").onclick = function () {
    var li = row("send", "Send code from the app with the bridged token");
    if (!checkToken) return done(li, false, "do the check first");
    var token = checkToken; usedCheckToken = token; checkToken = null;
    client.auth.signInWithOtp({ email: document.getElementById("email").value.trim(), options: { captchaToken: token, shouldCreateUser: true } })
      .then(function (r) { done(li, !r.error, r.error ? "refused: " + errCode(r.error) : "code sent — Supabase accepted the cross-origin token"); });
  };

  // 3 · Verify on the device (the person's own IP bucket), session stored in the app.
  var lastCode = null;
  document.getElementById("verify").onclick = function () {
    var li = row("verify", "Verify code → session in the app");
    var code = document.getElementById("code").value.replace(/\D/g, "");
    client.auth.verifyOtp({ email: document.getElementById("email").value.trim(), token: code, type: "email" }).then(function (r) {
      if (r.error) return done(li, false, "refused: " + errCode(r.error));
      lastCode = code;
      done(li, true, "signed in · expires " + new Date(r.data.session.expires_at * 1000).toLocaleTimeString());
    });
  };

  // 4 · API with bearer, refresh, data isolation.
  document.getElementById("tests").onclick = function () {
    client.auth.getSession().then(function (r) {
      var s = r.data.session;
      if (!s) return done(row("api", "Vercel API with bearer"), false, "not signed in");
      var me = s.user.id;
      var api = row("api", "Vercel API with bearer (cross-origin)");
      fetch(C.apiBase + "/api/app/ping", { headers: { Authorization: "Bearer " + s.access_token } })
        .then(function (x) { return x.json().then(function (j) { return [x.status, j]; }); })
        .then(function (x) { done(api, x[1].signedIn === true && /own_row|no_row/.test(x[1].rlsRead || ""), "HTTP " + x[0] + " · signedIn=" + x[1].signedIn + " · RLS=" + x[1].rlsRead); })
        .catch(function (e) { done(api, false, "blocked: " + errCode(e)); });

      var iso = row("rls", "Only my own Profile and Saved are readable");
      Promise.all([
        client.from("profiles").select("id"),
        client.from("saved_recipes").select("user_id"),
        client.from("saved_places").select("user_id"),
        client.from("decision_sessions").select("user_id").limit(200),
      ]).then(function (rs) {
        var err = rs.find(function (q) { return q.error; });
        if (err) return done(iso, false, "query error " + errCode(err.error));
        var others = rs.reduce(function (n, q) { return n + q.data.filter(function (x) { return (x.id || x.user_id) !== me; }).length; }, 0);
        done(iso, others === 0, "rows of other users visible: " + others + " (profiles " + rs[0].data.length + ", saved " + (rs[1].data.length + rs[2].data.length) + ", sessions " + rs[3].data.length + ")");
      });

      var ref = row("refresh", "Refresh gives a new session");
      var before = s.access_token, beforeExp = s.expires_at;
      client.auth.refreshSession().then(function (r2) {
        var n = r2.data.session;
        done(ref, !r2.error && !!n && n.access_token !== before && n.expires_at >= beforeExp, r2.error ? "refused: " + errCode(r2.error) : "new token · expires " + new Date(n.expires_at * 1000).toLocaleTimeString());
      });

      var bad = row("forged", "Tampered bearer token is refused");
      var forged = before.slice(0, -4) + (before.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
      fetch(C.apiBase + "/api/app/ping", { headers: { Authorization: "Bearer " + forged } })
        .then(function (x) { return x.json(); })
        .then(function (j) { done(bad, j.signedIn === false, "signedIn=" + j.signedIn + " (" + (j.reason || "") + ")"); });
    });
  };

  // 5 · Replays: the same Turnstile token again; the same email code again.
  document.getElementById("replay").onclick = function () {
    var email = document.getElementById("email").value.trim();
    var t = row("replay-token", "Reused check token is refused");
    if (!usedCheckToken) done(t, false, "send a code first");
    else client.auth.signInWithOtp({ email: email, options: { captchaToken: usedCheckToken, shouldCreateUser: false } })
      .then(function (r) { done(t, !!r.error, r.error ? "refused: " + errCode(r.error) : "ACCEPTED — replay worked"); });
    var c = row("replay-code", "Reused email code is refused");
    if (!lastCode) return done(c, false, "sign in first");
    // A throwaway client so a wrong answer can't touch the stored session.
    var scratch = window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    scratch.auth.verifyOtp({ email: email, token: lastCode, type: "email" }).then(function (r) { done(c, !!r.error, r.error ? "refused: " + errCode(r.error) : "ACCEPTED — replay worked"); });
    var w = row("wrong-code", "Wrong code is refused");
    scratch.auth.verifyOtp({ email: email, token: "00000000", type: "email" }).then(function (r) { done(w, !!r.error, r.error ? "refused: " + errCode(r.error) : "ACCEPTED"); });
    var st = row("wrong-state", "Callback with another state is dropped");
    var u = new URL("whattoeat-auth://check#state=" + "x".repeat(43) + "&token=" + "y".repeat(40));
    done(st, new URLSearchParams(u.hash.slice(1)).get("state") !== "z".repeat(43), "state check rejects it (same code path as step 1)");
  };

  // 6 · Logout everywhere; the old refresh token must no longer work.
  document.getElementById("signout").onclick = function () {
    client.auth.getSession().then(function (r) {
      var s = r.data.session; var li = row("logout", "Sign out revokes the session");
      if (!s) return done(li, false, "not signed in");
      var oldRefresh = s.refresh_token;
      client.auth.signOut({ scope: "global" }).then(function () {
        var scratch = window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        scratch.auth.refreshSession({ refresh_token: oldRefresh }).then(function (r2) {
          client.auth.getSession().then(function (r3) {
            done(li, !!r2.error && !r3.data.session, "old refresh token: " + (r2.error ? "refused (" + errCode(r2.error) + ")" : "STILL WORKS") + " · stored session: " + (r3.data.session ? "still there" : "cleared"));
          });
        });
      });
    });
  };
})();
