# Telegram Join/Leave Message Remover Bot

A simple, serverless Telegram bot that runs on [Cloudflare Workers](https://workers.cloudflare.com/). Its purpose is to keep your group chats tidy by automatically deleting the "user has joined" and "user has left" service messages.

## Features

- **Auto-Deletes Messages**: Automatically removes join and leave notifications from any group it's in.
- **Serverless**: Deploys in seconds to Cloudflare's global network. No servers to manage.
- **Secure**: Uses a secret token to verify that all incoming requests are from Telegram.
- **Help Command**: Responds to `/start` and `/help` in private messages with setup instructions.
- **Optional Owner-Only Mode**: Can be configured to only allow a specific user (the owner) to add it to groups, preventing misuse. If this mode is disabled, anyone can add the bot.

## How It Works

The bot uses the Telegram Bot API via a webhook. When a new message is posted in a group, Telegram sends the message data to a unique URL on a Cloudflare Worker. The worker's code inspects the message, and if it's a join or leave notification, it makes an API call back to Telegram to delete that message.

## Deployment

Follow these steps to deploy your own instance of the bot.

### 1. Get Required Information

You will need the following information.

- **Telegram Bot Token**: Get this from **[@BotFather](https://t.me/BotFather)** on Telegram.
- **Your Telegram User ID** (Optional): For owner-only mode, get your ID from **[@userinfobot](https://t.me/userinfobot)**.

### 2. Deploy to Cloudflare Workers

1. Log in to your [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **Workers & Pages** -> **Create application** -> **Create Worker**.
3. Give your worker a unique name and click **Deploy**.
4. Click **Quick Edit** to open the code editor.
5. Copy the code from `index.js` in this repository and paste it into the editor.

### 3. Configure Environment Variables

This is the most important step for making your bot work securely.

1. In your worker's dashboard, go to **Settings** -> **Variables**.
2. Add the following variables under **Environment Variables**. Click **Encrypt** for each one to keep it secure.

#### Required Variables

| Variable name  | Value                                           |
| -------------- | ----------------------------------------------- |
| `BOT_TOKEN`    | The full token from @BotFather.                 |
| `SECRET_TOKEN` | A long, random, and secure password you create. |

#### Optional Variables (for Owner-Only Mode)

Add this variable **only if you want to restrict who can add the bot to groups**. If you leave this out, anyone can add the bot.

| Variable name | Value                           |
| ------------- | ------------------------------- |
| `OWNER_ID`    | Your personal Telegram User ID. |

### 4. Set the Webhook

1. Click **Save and Deploy** in the worker editor.
2. Open a new browser tab and go to the following URL:  
   `https://<your-worker-name>.<your-subdomain>.workers.dev/setup`
3. You should see a success message (`"Webhook was set"`). This only needs to be done once.

## Usage

1. **Add your bot** to the Telegram group chat.
2. **Promote the bot to an Admin**.
3. Grant it the **"Delete Messages"** permission. It does not need any other permissions.

The bot will now silently delete join/leave messages.
