// ---------------------------------------------------------------------------
// page.ts — Firm Overview loopback dashboard page.
//
// renderPage() takes NO arguments and returns a static HTML document — no
// server-side data is ever interpolated into the page, so there is nothing
// here that could leak a secret. Every piece of live data (dashboard tiles,
// issues, approvals, deliverables) is fetched client-side from /api/board
// and rendered with textContent (never innerHTML) so an attacker-controlled
// issue/approval/deliverable title can never execute as HTML/script.
//
// Plain HTML + <style> + <script>, no framework, no external assets (this is
// a loopback operator page, not artifact-grade design — kept clean and
// readable). Status names are rendered verbatim, exactly as paperclip
// returns them.
// ---------------------------------------------------------------------------

export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Firm Overview</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f7f8;
    --card-bg: #ffffff;
    --border: #d8dadf;
    --text: #1c1e21;
    --muted: #6b7280;
    --accent: #2563eb;
    --danger: #b91c1c;
    --danger-bg: #fdecec;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 0 3rem;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
  }
  header h1 { font-size: 1.15rem; margin: 0; }
  #connect-bar { display: flex; align-items: center; gap: 0.6rem; }
  main { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .client-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }
  .client-card h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .client-card h3 { margin: 1rem 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .error-chip {
    display: inline-block;
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid var(--danger);
    border-radius: 999px;
    padding: 0.15rem 0.7rem;
    font-size: 0.8rem;
  }
  .tiles { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .tile { border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem; min-width: 6rem; }
  .tile-label { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .tile-value { font-size: 1.05rem; font-weight: 600; }
  ul.plain-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  ul.plain-list li { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .status-pill {
    display: inline-block;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.05rem 0.55rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .assignee { color: var(--muted); font-size: 0.85rem; }
  .approval-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.35rem 0; border-bottom: 1px dashed var(--border); }
  .approval-row:last-child { border-bottom: none; }
  .approval-row input[type="text"] { flex: 1 1 12rem; min-width: 8rem; padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
  button { cursor: pointer; border: 1px solid var(--border); background: var(--card-bg); border-radius: 6px; padding: 0.3rem 0.75rem; font: inherit; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.approve { border-color: #15803d; color: #15803d; }
  button.reject { border-color: var(--danger); color: var(--danger); }
  #generated-at { color: var(--muted); font-size: 0.8rem; padding: 0 1.5rem; }
  a { color: var(--accent); }
  .empty { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<header>
  <h1>Firm Overview</h1>
  <div id="connect-bar"></div>
</header>
<div id="generated-at"></div>
<main id="board"></main>
<script>
(function () {
  "use strict";

  var FIRM_OVERVIEW_HEADERS = { "X-Firm-Overview": "1" };

  function el(tag, opts) {
    var node = document.createElement(tag);
    if (opts) {
      if (opts.className) node.className = opts.className;
      if (opts.text !== undefined) node.textContent = opts.text;
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function safeLink(href, text) {
    var a = el("a", { text: text });
    // Deep links are built server-side from a trusted publicUrl config, but
    // guard against a non-http(s) scheme reaching an anchor href regardless.
    if (typeof href === "string" && /^https?:\\/\\//i.test(href)) {
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    return a;
  }

  // -----------------------------------------------------------------------
  // Connect bar
  // -----------------------------------------------------------------------

  function renderConnect(connect) {
    var bar = document.getElementById("connect-bar");
    clear(bar);
    if (!connect || connect.status === "disconnected") {
      var connectBtn = el("button", { text: "Connect" });
      connectBtn.className = "primary";
      connectBtn.addEventListener("click", startConnect);
      bar.appendChild(connectBtn);
      return;
    }
    if (connect.status === "awaiting_approval") {
      bar.appendChild(el("span", { text: "Awaiting approval\\u2026" }));
      if (connect.approvalUrl) {
        bar.appendChild(document.createTextNode(" "));
        bar.appendChild(safeLink(connect.approvalUrl, "Open approval"));
      }
      return;
    }
    // connected
    bar.appendChild(el("span", { text: "Connected" }));
    var disconnectBtn = el("button", { text: "Disconnect" });
    disconnectBtn.addEventListener("click", doDisconnect);
    bar.appendChild(disconnectBtn);
  }

  var pollTimer = null;

  function startConnect() {
    fetch("/api/connect", { method: "POST", headers: FIRM_OVERVIEW_HEADERS })
      .then(function (res) { return res.json(); })
      .then(function () { pollConnectStatus(); })
      .catch(function () {});
  }

  function pollConnectStatus() {
    fetch("/api/connect/status", { headers: FIRM_OVERVIEW_HEADERS })
      .then(function (res) { return res.json(); })
      .then(function (state) {
        renderConnect(state);
        if (state.status === "awaiting_approval") {
          if (pollTimer) clearTimeout(pollTimer);
          pollTimer = setTimeout(pollConnectStatus, 2000);
        } else if (state.status === "connected") {
          fetchBoard();
        }
      })
      .catch(function () {});
  }

  function doDisconnect() {
    fetch("/api/disconnect", { method: "POST", headers: FIRM_OVERVIEW_HEADERS })
      .then(function () { fetchBoard(); })
      .catch(function () {});
  }

  // -----------------------------------------------------------------------
  // Board
  // -----------------------------------------------------------------------

  function renderTiles(dashboard) {
    var wrap = el("div", { className: "tiles" });
    if (!dashboard || typeof dashboard !== "object") return wrap;
    Object.keys(dashboard).forEach(function (key) {
      var tile = el("div", { className: "tile" });
      var label = el("div", { className: "tile-label", text: key });
      var value = el("div", { className: "tile-value", text: String(dashboard[key]) });
      tile.appendChild(label);
      tile.appendChild(value);
      wrap.appendChild(tile);
    });
    return wrap;
  }

  function renderIssues(issues) {
    var list = el("ul", { className: "plain-list" });
    if (!issues || issues.length === 0) {
      list.appendChild(el("li", { className: "empty", text: "No open issues." }));
      return list;
    }
    issues.forEach(function (issue) {
      var li = el("li");
      var label = issue.identifier ? issue.identifier + " \\u2014 " + issue.title : issue.title;
      li.appendChild(safeLink(issue.deepLink, label));
      li.appendChild(el("span", { className: "status-pill", text: issue.status }));
      if (issue.assigneeAgentName) {
        li.appendChild(el("span", { className: "assignee", text: "\\u00b7 " + issue.assigneeAgentName }));
      }
      list.appendChild(li);
    });
    return list;
  }

  function renderApprovals(approvals) {
    var wrap = el("div");
    if (!approvals || approvals.length === 0) {
      wrap.appendChild(el("div", { className: "empty", text: "No open approvals." }));
      return wrap;
    }
    approvals.forEach(function (approval) {
      var row = el("div", { className: "approval-row" });
      row.appendChild(el("span", { text: approval.type + " (" + approval.status + ")" }));
      var note = document.createElement("input");
      note.type = "text";
      note.placeholder = "decision note (optional)";
      var approveBtn = el("button", { className: "approve", text: "Approve" });
      var rejectBtn = el("button", { className: "reject", text: "Reject" });
      approveBtn.addEventListener("click", function () { decide(approval.id, "approve", note.value); });
      rejectBtn.addEventListener("click", function () { decide(approval.id, "reject", note.value); });
      row.appendChild(note);
      row.appendChild(approveBtn);
      row.appendChild(rejectBtn);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderDeliverables(deliverables, truncated) {
    var wrap = el("div");
    var heading = truncated ? "Deliverables (most recent 10 issues)" : "Deliverables";
    wrap.appendChild(el("h3", { text: heading }));
    var list = el("ul", { className: "plain-list" });
    if (!deliverables || deliverables.length === 0) {
      list.appendChild(el("li", { className: "empty", text: "No deliverables yet." }));
    } else {
      deliverables.forEach(function (wp) {
        var li = el("li");
        li.appendChild(safeLink(wp.deepLink, wp.title));
        if (wp.status) li.appendChild(el("span", { className: "status-pill", text: wp.status }));
        list.appendChild(li);
      });
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderClientCard(client) {
    var card = el("section", { className: "client-card" });
    card.appendChild(el("h2", { text: client.name }));

    if (client.error) {
      card.appendChild(el("span", { className: "error-chip", text: "Error: " + client.error }));
      return card;
    }

    card.appendChild(renderTiles(client.dashboard));

    card.appendChild(el("h3", { text: "Open Issues" }));
    card.appendChild(renderIssues(client.issues));

    card.appendChild(el("h3", { text: "Open Approvals" }));
    card.appendChild(renderApprovals(client.approvals));

    card.appendChild(renderDeliverables(client.deliverables, client.deliverablesTruncated));

    return card;
  }

  function renderBoard(board) {
    var main = document.getElementById("board");
    clear(main);
    var generated = document.getElementById("generated-at");
    generated.textContent = board.generatedAt ? "Last updated: " + board.generatedAt : "";
    if (!board.clients || board.clients.length === 0) {
      main.appendChild(el("p", { className: "empty", text: "No clients found." }));
      return;
    }
    board.clients.forEach(function (client) {
      main.appendChild(renderClientCard(client));
    });
  }

  function decide(approvalId, action, note) {
    var verb = action === "approve" ? "approve" : "reject";
    if (!window.confirm("Are you sure you want to " + verb + " this approval?")) return;
    fetch("/api/approvals/" + encodeURIComponent(approvalId) + "/decide", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, FIRM_OVERVIEW_HEADERS),
      body: JSON.stringify({ action: action, decisionNote: note || undefined }),
    })
      .then(function () { fetchBoard(); })
      .catch(function () {});
  }

  function fetchBoard() {
    fetch("/api/board", { headers: FIRM_OVERVIEW_HEADERS })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.reauth) {
          renderConnect({ status: "disconnected" });
          var main = document.getElementById("board");
          clear(main);
          main.appendChild(el("p", { className: "empty", text: "Disconnected \\u2014 reconnect to view the board." }));
          return;
        }
        renderConnect(data.connect);
        renderBoard(data.board);
      })
      .catch(function () {});
  }

  fetchBoard();
  setInterval(fetchBoard, 20000);
})();
</script>
</body>
</html>
`;
}
