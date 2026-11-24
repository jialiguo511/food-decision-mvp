// Bundled-UI proof of concept (docs/IOS_RELEASE.md). Every result is shown on screen and logged as
// a short code; no token, code or email is ever logged.
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

  // 1. Where are we?
  done(row("origin", "Page origin"), location.protocol === "capacitor:", location.origin);

  // 2. Supabase reachable from this origin (CORS), with the public anon key.
  var sb = row("supabase", "Supabase reachable (CORS)");
  fetch(C.supabaseUrl + "/auth/v1/settings", { headers: { apikey: C.anonKey } })
    .then(function (r) { done(sb, r.ok, "HTTP " + r.status); })
    .catch(function (e) { done(sb, false, "blocked: " + e.name); });

  // 3. A Supabase client whose session lives in the app (localStorage of this origin).
  var client = window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "poc-auth" } });
  var sess = row("session", "Stored session after relaunch");
  client.auth.getSession().then(function (res) {
    var s = res.data.session;
    done(sess, true, s ? "signed in (restored from app storage)" : "no session yet");
    pingApi(s ? s.access_token : null);
  });

  // 4. Our Vercel API, cross-origin, with a bearer token instead of a cookie.
  function pingApi(token) {
    var li = row("api", "Vercel API with bearer token");
    var headers = token ? { Authorization: "Bearer " + token } : {};
    fetch(C.apiBase + "/api/app/ping", { headers: headers })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (x) {
        var j = x[1];
        var ok = token ? j.signedIn === true : j.ok === true;
        done(li, ok, "HTTP " + x[0] + " · signedIn=" + j.signedIn + (j.rlsRead ? " · RLS read=" + j.rlsRead : ""));
      })
      .catch(function (e) { done(li, false, "blocked: " + e.name + " (CORS or network)"); });
  }

  // 5. Turnstile on this origin: Cloudflare's always-pass test key (does the widget run here at all?)
  //    and the real site key (is this hostname accepted?).
  var captchaToken = null;
  var testRow = row("turnstile-test", "Turnstile runs here (Cloudflare test key)");
  var realRow = row("turnstile-real", "Turnstile accepts this origin (real key)");
  window.onTurnstileLoad = function () {
    var hidden = document.createElement("div"); hidden.style.display = "none"; document.body.appendChild(hidden);
    try {
      window.turnstile.render(hidden, {
        sitekey: "1x00000000000000000000AA",
        callback: function () { done(testRow, true, "token issued"); },
        "error-callback": function (code) { done(testRow, false, "error " + code); return true; },
      });
    } catch (e) { done(testRow, false, "render threw: " + e.name); }
    if (!C.turnstileSiteKey) { done(realRow, false, "no site key configured for this build"); return; }
    try {
      window.turnstile.render("#captcha", {
        sitekey: C.turnstileSiteKey,
        callback: function (t) { captchaToken = t; done(realRow, true, "token issued for " + location.hostname); },
        "error-callback": function (code) { done(realRow, false, "error " + code); return true; },
      });
    } catch (e) { done(realRow, false, "render threw: " + e.name); }
  };
  var s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
  s.onerror = function () { done(testRow, false, "script blocked"); done(realRow, false, "script blocked"); };
  document.head.appendChild(s);

  // 6. Email code sign-in from the bundled screen. The person types their own address and code.
  var auth = row("otp", "Email code sign-in");
  done(auth, true, "waiting for you (optional)");
  document.getElementById("send").onclick = function () {
    var email = document.getElementById("email").value.trim();
    client.auth.signInWithOtp({ email: email, options: captchaToken ? { captchaToken: captchaToken, shouldCreateUser: true } : { shouldCreateUser: true } })
      .then(function (r) { done(auth, !r.error, r.error ? "send failed: " + (r.error.code || r.error.status) : "code sent"); });
  };
  document.getElementById("verify").onclick = function () {
    var email = document.getElementById("email").value.trim();
    var code = document.getElementById("code").value.replace(/\D/g, "");
    client.auth.verifyOtp({ email: email, token: code, type: "email" }).then(function (r) {
      done(auth, !r.error, r.error ? "verify failed: " + (r.error.code || r.error.status) : "signed in");
      if (!r.error) pingApi(r.data.session.access_token);
    });
  };
  document.getElementById("signout").onclick = function () {
    client.auth.signOut({ scope: "local" }).then(function () { done(sess, true, "signed out (local)"); pingApi(null); });
  };
})();
