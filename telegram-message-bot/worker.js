const TELEGRAM_API = (token) => `https://api.telegram.org/bot${token}`;

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function tg(env, method, body) {
  const response = await fetch(`${TELEGRAM_API(env.BOT_TOKEN)}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

function isAdmin(update, env) {
  return String(update?.message?.from?.id ?? update?.callback_query?.from?.id) === String(env.ADMIN_ID);
}

async function handleUpdate(update, env) {
  if (update.callback_query) {
    const q = update.callback_query;

    if (!isAdmin(update, env)) {
      await tg(env, "answerCallbackQuery", {
        callback_query_id: q.id,
        text: "دسترسی ندارید.",
        show_alert: true,
      });
      return;
    }

    await tg(env, "answerCallbackQuery", { callback_query_id: q.id });

    if (String(q.data || "").startsWith("reply:")) {
      const targetId = String(q.data).slice("reply:".length);

      await tg(env, "sendMessage", {
        chat_id: env.ADMIN_ID,
        text:
          `✍️ <b>حالت پاسخ فعال شد</b>\n\n` +
          `🆔 User ID: <code>${esc(targetId)}</code>\n\n` +
          `پاسخ خودت را در ریپلای همین پیام بفرست.\n` +
          `برای لغو: /cancel`,
        parse_mode: "HTML",
        reply_markup: { force_reply: true, selective: true },
      });
    }
    return;
  }

  const message = update.message;
  if (!message || !message.from) return;

  const user = message.from;
  const chatId = message.chat.id;

  if (user.id === Number(env.ADMIN_ID)) {
    const replied = message.reply_to_message;
    const prompt = replied?.text || "";

    const match = prompt.match(/User ID:\s*<code>(\\d+)<\\/code>/);
    if (match) {
      const targetId = match[1];

      try {
        await tg(env, "copyMessage", {
          chat_id: targetId,
          from_chat_id: chatId,
          message_id: message.message_id,
        });

        await tg(env, "sendMessage", {
          chat_id: chatId,
          text: "✅ پاسخ برای کاربر ارسال شد.",
        });
      } catch (e) {
        await tg(env, "sendMessage", {
          chat_id: chatId,
          text: "❌ ارسال نشد؛ ممکن است کاربر ربات را بلاک کرده باشد.",
        });
      }
    }
    return;
  }

  if (message.text === "/start") {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text:
        "سلام 👋\n" +
        "پیامت رو همینجا بفرست تا برای مدیر ارسال بشه.\n\n" +
        "⚠️ این ربات ناشناس نیست و مدیر می‌تواند نام، username و User ID فرستنده را ببیند.",
    });
    return;
  }

  const username = user.username ? `@${user.username}` : "ندارد";

  await tg(env, "sendMessage", {
    chat_id: env.ADMIN_ID,
    text:
      "📩 <b>پیام جدید</b>\n\n" +
      `👤 نام: ${esc(user.first_name || "")}${user.last_name ? " " + esc(user.last_name) : ""}\n` +
      `🔹 Username: ${esc(username)}\n` +
      `🆔 User ID: <code>${user.id}</code>\n\n` +
      "👇 محتوای پیام:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "↩️ پاسخ به این کاربر", callback_data: `reply:${user.id}` }
      ]]
    },
  });

  await tg(env, "copyMessage", {
    chat_id: env.ADMIN_ID,
    from_chat_id: chatId,
    message_id: message.message_id,
  });

  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: "✅ پیام شما دریافت شد.",
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return new Response("Telegram bot is online ✅");
      }

      if (url.pathname === "/setup") {
        const key = url.searchParams.get("key");
        if (!env.SETUP_KEY || key !== env.SETUP_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const webhookUrl = `${url.origin}/telegram-webhook`;
        const result = await tg(env, "setWebhook", {
          url: webhookUrl,
          secret_token: env.WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"],
        });

        return Response.json(result);
      }

      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/telegram-webhook") {
      return new Response("Not found", { status: 404 });
    }

    if (env.WEBHOOK_SECRET) {
      const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (incomingSecret !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    try {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response("OK");
    } catch (error) {
      console.error(error);
      return new Response("OK");
    }
  },
};
