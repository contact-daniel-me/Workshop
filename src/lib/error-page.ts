export function renderErrorPage(error?: unknown): string {
  const errorMessage = error
    ? error instanceof Error
      ? error.message
      : String(error)
    : "";

  const safeErrorDisplay = errorMessage
    ? errorMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 32rem; width: 100%; text-align: center; padding: 2rem; background: #fff; border-radius: 1rem; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; font-weight: 700; color: #0f172a; }
      p { color: #475569; margin: 0 0 1.25rem; font-size: 0.95rem; }
      .err-box { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 0.85rem; border-radius: 0.5rem; font-size: 0.85rem; text-align: left; font-family: monospace; margin-bottom: 1.5rem; word-break: break-word; overflow-x: auto; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.6rem 1.25rem; border-radius: 0.5rem; font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #00564f; color: #fff; }
      .primary:hover { background: #00453f; }
      .secondary { background: #fff; color: #334155; border-color: #cbd5e1; }
      .secondary:hover { background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      ${safeErrorDisplay ? `<div class="err-box">${safeErrorDisplay}</div>` : ""}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
