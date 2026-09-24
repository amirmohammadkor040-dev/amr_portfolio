import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))

if not BOT_TOKEN or not ADMIN_ID:
    raise RuntimeError("BOT_TOKEN and ADMIN_ID environment variables are required.")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
reply_targets = {}

def user_info(user):
    username = f"@{user.username}" if user.username else "ندارد"
    return (
        "📩 <b>پیام جدید</b>\n\n"
        f"👤 نام: {user.full_name}\n"
        f"🔹 Username: {username}\n"
        f"🆔 User ID: <code>{user.id}</code>"
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "سلام 👋\n"
        "پیامت رو همینجا بفرست تا برای مدیر ارسال بشه.\n\n"
        "این ربات ناشناس نیست و مدیر می‌تواند اطلاعات حساب تلگرامی فرستنده را ببیند."
    )

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    reply_targets.pop(ADMIN_ID, None)
    await update.message.reply_text("حالت پاسخ لغو شد.")

async def user_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.effective_user:
        return

    user = update.effective_user

    if user.id == ADMIN_ID:
        target_id = reply_targets.pop(ADMIN_ID, None)
        if target_id:
            try:
                await context.bot.copy_message(
                    chat_id=target_id,
                    from_chat_id=update.effective_chat.id,
                    message_id=update.message.message_id,
                )
                await update.message.reply_text("✅ پاسخ برای کاربر ارسال شد.")
            except Exception:
                await update.message.reply_text(
                    "❌ ارسال نشد؛ ممکن است کاربر ربات را بلاک کرده باشد."
                )
        return

    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("↩️ پاسخ به این کاربر", callback_data=f"reply:{user.id}")
    ]])

    await context.bot.send_message(
        chat_id=ADMIN_ID,
        text=user_info(user) + "\n\n👇 محتوای پیام:",
        parse_mode="HTML",
        reply_markup=keyboard,
    )

    await context.bot.copy_message(
        chat_id=ADMIN_ID,
        from_chat_id=update.effective_chat.id,
        message_id=update.message.message_id,
    )

    await update.message.reply_text("✅ پیام شما دریافت شد.")

async def reply_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.from_user.id != ADMIN_ID:
        await query.answer("دسترسی ندارید.", show_alert=True)
        return

    target_id = int(query.data.split(":", 1)[1])
    reply_targets[ADMIN_ID] = target_id

    await query.message.reply_text(
        f"✍️ حالت پاسخ فعال شد.\n"
        f"پیام بعدی برای User ID <code>{target_id}</code> ارسال می‌شود.\n\n"
        "برای لغو: /cancel",
        parse_mode="HTML",
    )

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("cancel", cancel))
    app.add_handler(CallbackQueryHandler(reply_button, pattern=r"^reply:\d+$"))
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, user_message))
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
