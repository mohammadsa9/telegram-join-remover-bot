/**
 * index.js
 *
 * This is a Cloudflare Worker that acts as a Telegram bot.
 * Its primary function is to listen for new members joining or leaving a group
 * and delete the corresponding service message (e.g., "John Doe has joined the group").
 *
 * It will also respond with a help message if a user sends /start or /help
 * in a private chat with the bot.
 *
 * OPTIONAL SECURITY: The bot can be configured to only allow a specific user (the owner)
 * to add it to groups. If `OWNER_ID` and `BOT_ID` are both set in the environment,
 * the bot will leave any group it's added to by another user. If they are not set,
 * this check is disabled, and anyone can add the bot.
 *
 * For this to work, the bot must be a member of the target Telegram group
 * and be promoted to an Admin with the "Delete Messages" permission.
 */

export default {
    /**
     * The main fetch handler for the Cloudflare Worker.
     * It acts as a router to handle different incoming requests.
     * @param {Request} request - The incoming request object.
     * @param {object} env - The environment variables/secrets.
     * @param {object} ctx - The execution context.
     * @returns {Response} The response to send back.
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Simple router
        switch (url.pathname) {
            case "/setup":
                return handleSetup(request, env);
            case "/":
                // The webhook endpoint should handle POST requests from Telegram
                if (request.method === "POST") {
                    return handleWebhook(request, env, ctx);
                }
                return new Response("Expected POST for webhook", { status: 405 });
            default:
                return new Response("Not Found", { status: 404 });
        }
    },
};

/**
 * Handles the /setup endpoint.
 * This function registers the worker's URL as the webhook for the Telegram bot.
 * @param {Request} request - The incoming request object.
 * @param {object} env - The environment variables containing BOT_TOKEN and SECRET_TOKEN.
 * @returns {Response} A response indicating whether the webhook setup was successful.
 */
async function handleSetup(request, env) {
    try {
        const url = new URL(request.url);
        const webhookUrl = `${url.protocol}//${url.hostname}/`;
        const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
        const params = {
            url: webhookUrl,
            secret_token: env.SECRET_TOKEN,
            allowed_updates: ["message"],
        };

        const response = await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });

        const responseData = await response.json();

        return new Response(
            `Webhook setup result:\n<pre>${JSON.stringify(
                responseData,
                null,
                2
            )}</pre>`,
            { headers: { "Content-Type": "text/html" } }
        );
    } catch (error) {
        console.error("Error in handleSetup:", error);
        return new Response(`Setup failed: ${error.message}`, { status: 500 });
    }
}

/**
 * Handles incoming webhooks from Telegram.
 * Checks for join/leave messages, responds to help commands, and handles owner-only logic.
 * @param {Request} request - The incoming request from Telegram.
 * @param {object} env - The environment variables.
 * @param {object} ctx - The execution context.
 * @returns {Response} A 200 OK response to acknowledge receipt.
 */
async function handleWebhook(request, env, ctx) {
    const telegramSecretToken = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
    );
    if (telegramSecretToken !== env.SECRET_TOKEN) {
        return new Response("Unauthorized", { status: 403 });
    }

    try {
        const update = await request.json();

        if (update.message) {
            const msg = update.message;

            // Handle /start and /help in private chats
            if (
                msg.chat.type === "private" &&
                (msg.text === "/start" || msg.text === "/help")
            ) {
                ctx.waitUntil(sendHelpMessage(env, msg.chat.id));
            }

            // Handle messages in groups
            if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
                const isJoinMessage =
                    msg.new_chat_members && msg.new_chat_members.length > 0;
                const isLeaveMessage = msg.left_chat_member;

                // Determine if the optional security check should be performed.
                const performOwnerCheck = env.OWNER_ID && env.BOT_ID;

                if (isJoinMessage) {
                    if (performOwnerCheck) {
                        // Security check is enabled.
                        const botWasAdded = msg.new_chat_members.some(
                            (member) => member.id.toString() === env.BOT_ID
                        );

                        if (botWasAdded && msg.from.id.toString() !== env.OWNER_ID) {
                            // Bot was added by an unauthorized user, so leave the group.
                            ctx.waitUntil(leaveGroup(env, msg.chat.id));
                        } else {
                            // A regular user joined or the bot was added by the owner, so delete the join message.
                            ctx.waitUntil(deleteMessage(env, msg.chat.id, msg.message_id));
                        }
                    } else {
                        // Security check is disabled, just delete the message.
                        ctx.waitUntil(deleteMessage(env, msg.chat.id, msg.message_id));
                    }
                } else if (isLeaveMessage) {
                    // A user left, so delete the leave message.
                    ctx.waitUntil(deleteMessage(env, msg.chat.id, msg.message_id));
                }
            }
        }
    } catch (error) {
        console.error("Error processing webhook:", error);
        return new Response("Error processing update", { status: 500 });
    }

    // Always return a 200 OK to Telegram
    return new Response("OK", { status: 200 });
}

/**
 * Sends the introductory/help message to a private chat.
 * @param {object} env - The environment variables with the BOT_TOKEN.
 * @param {number} chatId - The ID of the chat to send the message to.
 */
async function sendHelpMessage(env, chatId) {
    const text = `This bot keeps your group chats tidy and free of clutter by automatically deleting the "user has joined" and "user has left" service messages.

To make it work, simply:
1. Add me to your group.
2. Promote me to an Admin.
3. Grant me the "Delete Messages" permission.`;

    const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    try {
        await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: text }),
        });
    } catch (error) {
        console.error("Error in sendHelpMessage:", error);
    }
}

/**
 * Calls the Telegram API to delete a specific message.
 * @param {object} env - The environment variables with the BOT_TOKEN.
 * @param {number} chatId - The ID of the chat where the message is.
 * @param {number} messageId - The ID of the message to delete.
 */
async function deleteMessage(env, chatId, messageId) {
    const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`;
    try {
        await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
        });
    } catch (error) {
        console.error("Error in deleteMessage:", error);
    }
}

/**
 * Calls the Telegram API for the bot to leave a group.
 * @param {object} env - The environment variables with the BOT_TOKEN.
 * @param {number} chatId - The ID of the chat to leave.
 */
async function leaveGroup(env, chatId) {
    console.log(`Leaving group ${chatId} due to unauthorized add.`);
    const telegramApiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/leaveChat`;
    try {
        await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId }),
        });
    } catch (error) {
        console.error("Error in leaveGroup:", error);
    }
}
