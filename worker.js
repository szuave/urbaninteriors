// Cloudflare Worker — serveert de statische site én verwerkt het contactformulier.
// Het formulier POST't JSON naar /api/contact; dit stuurt een mail via Resend
// naar karel@urbaninteriors.be. Alle overige verzoeken gaan naar de statische bestanden.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    // Alles wat geen API-route is -> statische bestanden (HTML, CSS, foto's, ...)
    return env.ASSETS.fetch(request);
  },
};

const RECIPIENT = "contact@urbaninteriors.be";
const FROM = "Urban Interiors <onboarding@resend.dev>";

async function handleContact(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Ongeldige aanvraag." }, 400);
  }

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const phone = String(data.phone || "").trim();
  const message = String(data.message || "").trim();
  const lang = String(data.lang || "nl").trim();

  if (!name || !email || !message) {
    return json({ error: "Verplichte velden ontbreken." }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Ongeldig e-mailadres." }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: "E-mailservice niet geconfigureerd." }, 500);
  }

  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;">
      <h2 style="margin:0 0 16px;">Nieuw bericht via urbaninteriors.be</h2>
      <p style="margin:4px 0;"><strong>Naam:</strong> ${esc(name)}</p>
      <p style="margin:4px 0;"><strong>E-mail:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></p>
      <p style="margin:4px 0;"><strong>Telefoon:</strong> ${esc(phone) || "—"}</p>
      <p style="margin:4px 0;"><strong>Taal:</strong> ${esc(lang)}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">
      <p style="white-space:pre-wrap;margin:0;">${esc(message)}</p>
    </div>
  `;

  const text =
    `Nieuw bericht via urbaninteriors.be\n\n` +
    `Naam: ${name}\nE-mail: ${email}\nTelefoon: ${phone || "—"}\nTaal: ${lang}\n\n${message}\n`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [RECIPIENT],
        reply_to: email,
        subject: `Nieuw contactbericht van ${name}`,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "Mail kon niet verzonden worden.", detail }, 502);
    }

    return json({ ok: true }, 200);
  } catch {
    return json({ error: "Serverfout bij verzenden." }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
