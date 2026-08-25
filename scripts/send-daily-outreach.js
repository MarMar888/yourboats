// Sends the next un-sent entry in data/outreach-queue.json via Resend,
// one per run. Meant to be invoked once a day by
// .github/workflows/daily-outreach.yml. Marks the sent entry with a
// timestamp and Resend message id so re-runs (or catch-up runs after a
// missed day) never double-send.
const fs = require("fs");
const path = require("path");

const QUEUE_PATH = path.join(__dirname, "..", "data", "outreach-queue.json");

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
  const next = queue.find((entry) => !entry.sent);

  if (!next) {
    console.log("Queue is empty, nothing to send today.");
    return;
  }

  console.log(`Sending to ${next.name} <${next.email}>...`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Marley Barrett <marley@squeakycleanboats.com>",
      to: [next.email],
      subject: next.subject,
      text: next.text,
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(
      `Resend API error (${res.status}) for ${next.email}: ${JSON.stringify(body)}`
    );
  }

  next.sent = true;
  next.sentAt = new Date().toISOString();
  next.resendId = body.id;

  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");

  console.log(`Sent to ${next.name} <${next.email}>, id ${body.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
