import express from 'express';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Parse URL-encoded bodies (from Twilio webhooks)
app.use(express.urlencoded({ extended: false }));

// Your fallback phone numbers (in order of priority)
const FALLBACK_NUMBERS = [
  process.env.PHONE_NUMBER_1 || '+1234567890',
  process.env.PHONE_NUMBER_2 || '+0987654321',
  process.env.PHONE_NUMBER_3 || '+1122334455'
];

// Timeout in seconds for each dial attempt
const DIAL_TIMEOUT = parseInt(process.env.DIAL_TIMEOUT) || 20;

/**
 * Initial TwiML endpoint - Retell transfers here
 * This starts the cascading dial sequence
 */
app.post('/voice/start', (req, res) => {
  console.log('📞 Incoming call from Retell');

  const twiml = new twilio.twiml.VoiceResponse();

  // Start with the first number
  const dial = twiml.dial({
    action: '/voice/handle-result?attempt=0',
    timeout: DIAL_TIMEOUT
  });

  dial.number(FALLBACK_NUMBERS[0]);

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Handles dial results and cascades to next number if needed
 */
app.post('/voice/handle-result', (req, res) => {
  const dialStatus = req.body.DialCallStatus;
  const attempt = parseInt(req.query.attempt) || 0;

  console.log(`📊 Dial result - Attempt ${attempt + 1}: ${dialStatus}`);

  const twiml = new twilio.twiml.VoiceResponse();

  // If call was answered, we're done
  if (dialStatus === 'completed') {
    console.log('✅ Call connected successfully');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  // Try next number if available
  const nextAttempt = attempt + 1;

  if (nextAttempt < FALLBACK_NUMBERS.length) {
    console.log(`🔄 Trying next number: ${FALLBACK_NUMBERS[nextAttempt]}`);

    const dial = twiml.dial({
      action: `/voice/handle-result?attempt=${nextAttempt}`,
      timeout: DIAL_TIMEOUT
    });

    dial.number(FALLBACK_NUMBERS[nextAttempt]);
  } else {
    // All numbers failed - handle with voicemail or message
    console.log('❌ All numbers unavailable - going to voicemail');

    twiml.say(
      'All representatives are currently unavailable. Please leave a message after the beep.'
    );

    twiml.record({
      maxLength: 60,
      action: '/voice/save-voicemail',
      transcribe: true,
      transcribeCallback: '/voice/voicemail-transcription'
    });
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Handles voicemail recording
 */
app.post('/voice/save-voicemail', (req, res) => {
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;

  console.log('📧 Voicemail recorded:', {
    callSid,
    recordingUrl
  });

  // TODO: Save to database, send notification email, etc.

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Thank you for your message. Goodbye.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Receives voicemail transcription
 */
app.post('/voice/voicemail-transcription', (req, res) => {
  const transcription = req.body.TranscriptionText;
  const callSid = req.body.CallSid;

  console.log('📝 Voicemail transcription:', {
    callSid,
    transcription
  });

  // TODO: Send email/SMS with transcription, save to CRM, etc.

  res.sendStatus(200);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    numbers: FALLBACK_NUMBERS.length,
    timeout: DIAL_TIMEOUT
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Twilio cascading forward server running on port ${PORT}`);
  console.log(`📞 Fallback numbers configured: ${FALLBACK_NUMBERS.length}`);
  console.log(`⏱️  Dial timeout: ${DIAL_TIMEOUT}s per number`);
});