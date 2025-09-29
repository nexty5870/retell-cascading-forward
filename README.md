# Retell + Twilio Cascading Call Forwarding Server

A simple Express server that handles cascading call forwarding for Retell AI voice agents using Twilio. When a call is transferred from your Retell agent, it tries multiple phone numbers in sequence until someone picks up.

## 🎯 How It Works

1. **Retell AI agent** transfers call to your Twilio number
2. **Server receives call** at `/voice/start` endpoint
3. **Dials first number** with 20-second timeout
4. **If no answer**, automatically tries next number
5. **Repeats** until someone answers or all numbers exhausted
6. **If all fail**, takes voicemail with transcription

## 📁 Project Structure

```
cascading-forward-server/
├── server.js          # Main Express server with TwiML logic
├── package.json       # Dependencies
├── .env.example       # Environment variables template
├── .env               # Your actual config (create this)
└── README.md          # This file
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd /Users/shvz/.claude/context/projects/makeautomation/voicereceptionist/cascading-forward-server
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update with your phone numbers:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000

# Add your actual phone numbers in E.164 format
PHONE_NUMBER_1=+15551234567  # First person to try
PHONE_NUMBER_2=+15559876543  # Second person
PHONE_NUMBER_3=+15551122334  # Third person

DIAL_TIMEOUT=20  # Seconds to wait before trying next number
```

### 3. Run the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## 🌐 Deployment Options

### Option 1: Railway (Easiest)
1. Push code to GitHub
2. Connect Railway to your repo
3. Add environment variables in Railway dashboard
4. Railway auto-deploys and gives you a public URL

### Option 2: Cloudflare Workers (Your Setup)
Since you deploy via GitHub → Cloudflare:
1. Push this to your repo
2. Cloudflare auto-deploys
3. You'll get a URL like `https://your-app.your-domain.workers.dev`

### Option 3: Digital Ocean / Heroku / Fly.io
Standard Node.js deployment - any platform works.

### Option 4: Local with ngrok (Testing)
```bash
# Start server
npm run dev

# In another terminal
ngrok http 3000
```
Use the ngrok URL for testing before deploying.

## 🔗 Connecting to Twilio & Retell

### Step 1: Configure Twilio Number

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Select your Twilio number
4. Under "Voice Configuration":
   - **A Call Comes In**: Webhook
   - **URL**: `https://your-server.com/voice/start`
   - **HTTP Method**: POST
5. Save

### Step 2: Configure Retell Agent

In your Retell dashboard:

1. Go to your agent settings
2. Under **Call Transfer** settings:
   - **Transfer Number**: Your Twilio number (e.g., `+15559998888`)
   - **Transfer Type**: Cold Transfer (since we handle the logic)
3. Update agent prompt to include transfer instructions:

```
If the user requests to speak with a human or needs assistance
beyond your capabilities, transfer the call to a live agent.
```

## 🎨 Customization

### Add More Numbers

Edit `.env`:
```env
PHONE_NUMBER_4=+15554445555
PHONE_NUMBER_5=+15556667777
```

Update `server.js:13` to include them:
```javascript
const FALLBACK_NUMBERS = [
  process.env.PHONE_NUMBER_1,
  process.env.PHONE_NUMBER_2,
  process.env.PHONE_NUMBER_3,
  process.env.PHONE_NUMBER_4,
  process.env.PHONE_NUMBER_5,
];
```

### Change Timeout

Adjust `DIAL_TIMEOUT` in `.env` (in seconds):
```env
DIAL_TIMEOUT=15  # Shorter timeout
DIAL_TIMEOUT=30  # Longer timeout
```

### Custom Voicemail Message

Edit `server.js:73`:
```javascript
twiml.say(
  'Our team is currently assisting other customers. Please leave a detailed message.'
);
```

### Send Notifications

Add email/SMS notifications in `server.js:92`:
```javascript
app.post('/voice/save-voicemail', async (req, res) => {
  const recordingUrl = req.body.RecordingUrl;

  // Send email notification
  await sendEmail({
    to: 'your@email.com',
    subject: 'New Voicemail',
    body: `Recording: ${recordingUrl}`
  });

  // ... rest of code
});
```

## 🧪 Testing

### Test the health endpoint:
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "healthy",
  "numbers": 3,
  "timeout": 20
}
```

### Test with Twilio Console:
1. Go to Twilio Console → Phone Numbers
2. Use "Test" feature to make a test call
3. Watch server logs for dial attempts

## 📊 Call Flow Diagram

```
┌─────────────┐
│   Caller    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Retell AI   │ (Voice Agent answers)
│   Agent     │
└──────┬──────┘
       │ (User asks for human)
       ▼
┌─────────────┐
│   Twilio    │ (Transfer to Twilio number)
│   Number    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Your Express Server            │
│  /voice/start                   │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────┐
│ Try Number 1│───► No Answer (20s timeout)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Try Number 2│───► No Answer (20s timeout)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Try Number 3│───► ANSWERED ✓
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Connected!  │
└─────────────┘

If all fail → Voicemail
```

## 🔍 Troubleshooting

### Calls not forwarding:
- Check Twilio webhook URL is correct and publicly accessible
- Verify phone numbers are in E.164 format (`+[country][number]`)
- Check server logs for errors

### Voicemail not recording:
- Ensure `/voice/save-voicemail` endpoint is accessible
- Check Twilio account has recording enabled
- Verify transcription is enabled in your Twilio account

### Numbers in wrong order:
- Array order in `FALLBACK_NUMBERS` determines priority
- First number in array = first attempt

## 💰 Cost Considerations

**Twilio charges per:**
- Incoming call minute
- Outgoing call minute (to each number you try)
- Recording storage
- Transcription (optional)

**Example scenario:**
- 3 numbers, 20s timeout each = ~1 minute of dial time
- If no answer on all 3 = charges for ~1 min + recording
- If answered on attempt 2 = charges for ~40s dial + conversation time

## 🔐 Security Notes

- Never commit `.env` file (it's in `.gitignore`)
- Use environment variables for all sensitive data
- Consider adding Twilio signature validation for production
- Use HTTPS in production (required by Twilio)

## 📚 Resources

- [Twilio TwiML Dial Documentation](https://www.twilio.com/docs/voice/twiml/dial)
- [Retell AI Call Transfer Guide](https://docs.retellai.com/build/single-multi-prompt/transfer-call)
- [Express.js Documentation](https://expressjs.com/)

## 🆘 Need Help?

Server logs show detailed info about each call attempt:
```
📞 Incoming call from Retell
📊 Dial result - Attempt 1: no-answer
🔄 Trying next number: +15559876543
📊 Dial result - Attempt 2: completed
✅ Call connected successfully
```

Watch the logs to debug issues!