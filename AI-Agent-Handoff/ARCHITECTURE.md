# AI Agent Handoff Architecture - Recommended Implementation

## Overview

This architecture document outlines the **recommended approach** for implementing AI-assisted human agent handoff with call monitoring and transcription capabilities, working within VAPI's current limitations.

---

## Solution: External Monitoring + Real-Time Agent Dashboard

Since VAPI doesn't support three-way conferencing with silent AI participants, we'll implement a hybrid solution that achieves the business goals through external monitoring and real-time assistance.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CALL FLOW                                    │
└─────────────────────────────────────────────────────────────────────┘

Customer
   │
   │ (1) Incoming Call
   ↓
┌──────────────────┐
│  VAPI AI Agent   │
│  (Receptionist)  │
└────────┬─────────┘
         │
         │ (2) Qualification & Routing
         │
         ├─── (3a) Transfer Decision
         │         VAPI webhook: transfer-destination-request
         ↓
┌──────────────────────────────────────────────────────────────────┐
│              Your Cascading Forward Server                       │
│  - Receives transfer webhook                                     │
│  - Retrieves monitor.listenUrl from call object                  │
│  - Determines human agent to route to                            │
│  - Responds with destination phone number                        │
└──────────────────────────────────────────────────────────────────┘
         │
         ├─── (3b) AI Transfers Call to Human Agent
         │
         ↓
┌──────────────────┐
│  Human Agent     │ ←─── (4) Receives transferred call
│  (Phone)         │
└──────────────────┘
         │
         │ (5) Conversation with Customer
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│               PARALLEL MONITORING SYSTEM                            │
└─────────────────────────────────────────────────────────────────────┘

monitor.listenUrl (WebSocket)
         │
         ↓
┌──────────────────────────────┐
│  WebSocket Audio Stream      │
│  - PCM audio data            │
│  - Real-time streaming       │
└──────────┬───────────────────┘
           │
           ↓
┌──────────────────────────────┐
│  Transcription Service       │
│  - Deepgram / AssemblyAI     │
│  - Real-time STT             │
│  - Speaker diarization       │
└──────────┬───────────────────┘
           │
           ↓
┌──────────────────────────────┐
│  AI Analysis Engine          │
│  - Sentiment analysis        │
│  - Intent detection          │
│  - Knowledge base search     │
│  - Suggestion generation     │
└──────────┬───────────────────┘
           │
           ↓
┌──────────────────────────────┐
│  Real-Time Dashboard         │
│  (Agent's Browser)           │
│  - Live transcript           │
│  - AI suggestions            │
│  - Customer context          │
│  - Knowledge base articles   │
└──────────────────────────────┘
```

---

## Component Breakdown

### 1. VAPI AI Agent (Receptionist)
**Responsibilities:**
- Answer incoming calls
- Qualify customer needs
- Determine if human handoff is needed
- Execute transfer via transfer tool

**Configuration:**
```json
{
  "tools": [
    {
      "type": "transfer",
      "destinations": [
        {
          "type": "number",
          "number": "{{HUMAN_AGENT_PHONE}}",
          "description": "Customer needs to speak with a human agent"
        }
      ]
    }
  ],
  "serverUrl": "https://your-server.com/vapi/webhook"
}
```

### 2. Cascading Forward Server (Enhanced)
**New Endpoints:**

#### `/vapi/webhook` - VAPI Event Handler
Handles all VAPI events including:
- `transfer-destination-request`: Determine which human to route to
- `call.started`: Initialize monitoring
- `call.ended`: Cleanup and finalize transcripts

#### `/monitoring/start` - Initialize Call Monitoring
```typescript
interface StartMonitoringRequest {
  callId: string;
  listenUrl: string;
  humanAgentId: string;
  customerContext: {
    name?: string;
    issue: string;
    sentiment: string;
    // ... other context from AI conversation
  };
}
```

**Flow:**
1. Receive transfer webhook from VAPI
2. Extract `monitor.listenUrl` from call object
3. Look up human agent availability
4. Respond with destination phone number
5. Trigger monitoring system to connect to `listenUrl`
6. Initialize agent dashboard session

### 3. WebSocket Audio Monitor
**Technology:** Node.js with `ws` library

**Responsibilities:**
- Connect to VAPI's `monitor.listenUrl`
- Receive real-time PCM audio stream
- Forward audio chunks to transcription service
- Handle connection lifecycle (connect, reconnect, cleanup)

**Implementation:**
```typescript
import WebSocket from 'ws';
import { TranscriptionService } from './transcription';

class VAPICallMonitor {
  private ws: WebSocket;
  private transcriptionService: TranscriptionService;
  private callId: string;

  async connect(listenUrl: string, callId: string) {
    this.callId = callId;
    this.ws = new WebSocket(listenUrl);

    this.ws.on('open', () => {
      console.log(`Connected to call ${callId} monitoring`);
      this.transcriptionService.start(callId);
    });

    this.ws.on('message', async (data: Buffer) => {
      // Forward PCM audio to transcription
      await this.transcriptionService.processAudio(data);
    });

    this.ws.on('close', () => {
      console.log(`Call ${callId} monitoring ended`);
      this.transcriptionService.finalize(callId);
    });

    this.ws.on('error', (error) => {
      console.error(`WebSocket error for call ${callId}:`, error);
      // Implement retry logic
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

### 4. Real-Time Transcription Service
**Recommended Provider:** Deepgram or AssemblyAI

**Features Needed:**
- Real-time streaming transcription
- Speaker diarization (identify customer vs agent)
- Interim results for immediate display
- Final results for accuracy

**Integration:**
```typescript
import { Deepgram } from '@deepgram/sdk';

class TranscriptionService {
  private deepgram: Deepgram;
  private activeStreams: Map<string, any>;

  constructor() {
    this.deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
    this.activeStreams = new Map();
  }

  async start(callId: string) {
    const dgLive = this.deepgram.transcription.live({
      punctuate: true,
      diarize: true, // Speaker identification
      interim_results: true,
      language: 'en-US',
    });

    dgLive.on('transcriptReceived', (transcript) => {
      this.handleTranscript(callId, transcript);
    });

    this.activeStreams.set(callId, dgLive);
  }

  async processAudio(callId: string, audioChunk: Buffer) {
    const stream = this.activeStreams.get(callId);
    if (stream) {
      stream.send(audioChunk);
    }
  }

  private async handleTranscript(callId: string, transcript: any) {
    // 1. Store transcript segment in database
    await db.transcripts.create({
      callId,
      speaker: transcript.channel.alternatives[0].speaker,
      text: transcript.channel.alternatives[0].transcript,
      timestamp: new Date(),
      isFinal: transcript.is_final,
    });

    // 2. Send to AI analysis engine
    await this.analyzeAndSuggest(callId, transcript);

    // 3. Broadcast to agent dashboard via WebSocket
    await this.broadcastToAgent(callId, transcript);
  }
}
```

### 5. AI Analysis Engine
**Responsibilities:**
- Analyze transcript in real-time
- Detect customer sentiment
- Identify intents and topics
- Search knowledge base for relevant articles
- Generate response suggestions for human agent

**Implementation:**
```typescript
interface TranscriptAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  intent: string;
  topics: string[];
  urgency: 'low' | 'medium' | 'high';
  suggestions: AgentSuggestion[];
}

interface AgentSuggestion {
  type: 'knowledge_article' | 'response_template' | 'escalation';
  content: string;
  confidence: number;
}

class AIAnalysisEngine {
  async analyzeTranscript(
    callId: string,
    recentTranscript: string,
    fullContext: string[]
  ): Promise<TranscriptAnalysis> {
    // Use OpenAI or Claude to analyze
    const analysis = await this.llm.analyze({
      system: `You are an AI assistant helping a human customer service agent.
      Analyze the conversation and provide:
      1. Customer sentiment
      2. Main intent/topic
      3. Relevant knowledge base articles
      4. Suggested responses

      Be concise and actionable.`,
      messages: [
        { role: 'user', content: fullContext.join('\n') },
        { role: 'user', content: `Latest: ${recentTranscript}` },
      ],
    });

    // Search knowledge base
    const relevantArticles = await this.searchKnowledgeBase(
      analysis.topics
    );

    return {
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      topics: analysis.topics,
      urgency: analysis.urgency,
      suggestions: [
        ...relevantArticles,
        ...analysis.suggestedResponses,
      ],
    };
  }

  private async searchKnowledgeBase(topics: string[]) {
    // Vector search or keyword search in your knowledge base
    // Return relevant articles for agent reference
  }
}
```

### 6. Real-Time Agent Dashboard
**Technology:** Next.js + WebSockets (Socket.io)

**Features:**
- Live transcript display (scrolling)
- Speaker identification (Customer vs Agent)
- Real-time AI suggestions sidebar
- Customer context panel (from initial AI conversation)
- Knowledge base article quick-access
- Call controls (optional: mute, hold, transfer)

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Call ID: abc123                    Duration: 00:05:32      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Customer Context:                    AI Suggestions:        │
│  ┌──────────────────┐               ┌──────────────────┐   │
│  │ Name: John Doe   │               │ 📄 KB Article:   │   │
│  │ Issue: Billing   │               │ "Refund Policy"  │   │
│  │ Sentiment: 😐    │               │                  │   │
│  │ Priority: Medium │               │ 💡 Suggestion:   │   │
│  └──────────────────┘               │ "Offer 10% disc" │   │
│                                      └──────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Live Transcript:                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [00:05:20] 🤖 AI: "Let me transfer you to an agent" │   │
│  │ [00:05:25] 👤 Customer: "Thank you"                  │   │
│  │ [00:05:28] 👨‍💼 Agent: "Hello, how can I help you?"     │   │
│  │ [00:05:31] 👤 Customer: "I need a refund..."         │   │
│  │ ↓ typing...                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**WebSocket Implementation:**
```typescript
// Client-side (Next.js)
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export default function AgentDashboard({ callId }: { callId: string }) {
  const [transcript, setTranscript] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const socket = io('wss://your-server.com');

    socket.emit('join-call', { callId });

    socket.on('transcript-update', (data) => {
      setTranscript(prev => [...prev, data]);
    });

    socket.on('ai-suggestion', (data) => {
      setSuggestions(prev => [data, ...prev]);
    });

    return () => socket.disconnect();
  }, [callId]);

  return (
    // UI components
  );
}
```

---

## Database Schema

### Tables

#### `monitored_calls`
```sql
CREATE TABLE monitored_calls (
  id UUID PRIMARY KEY,
  vapi_call_id VARCHAR(255) UNIQUE NOT NULL,
  customer_phone VARCHAR(20),
  human_agent_id VARCHAR(255),
  human_agent_phone VARCHAR(20),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  status VARCHAR(50), -- 'monitoring', 'completed', 'failed'
  listen_url TEXT,
  customer_context JSONB, -- Context from AI conversation
  final_analysis JSONB, -- Post-call AI analysis
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `call_transcripts`
```sql
CREATE TABLE call_transcripts (
  id UUID PRIMARY KEY,
  call_id UUID REFERENCES monitored_calls(id),
  speaker VARCHAR(50), -- 'customer', 'agent', 'ai'
  text TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  is_final BOOLEAN DEFAULT false,
  sentiment VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_call_timestamp (call_id, timestamp)
);
```

#### `ai_suggestions`
```sql
CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY,
  call_id UUID REFERENCES monitored_calls(id),
  suggestion_type VARCHAR(50), -- 'knowledge_article', 'response_template', 'escalation'
  content TEXT NOT NULL,
  confidence FLOAT,
  timestamp TIMESTAMP NOT NULL,
  was_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Implementation Phases

### Phase 1: Basic Monitoring (Week 1-2)
- [ ] Set up WebSocket connection to `monitor.listenUrl`
- [ ] Integrate Deepgram real-time transcription
- [ ] Store transcripts in database
- [ ] Basic agent dashboard (transcript display only)

### Phase 2: AI Analysis (Week 3-4)
- [ ] Implement AI analysis engine
- [ ] Sentiment analysis
- [ ] Intent detection
- [ ] Knowledge base search integration
- [ ] Display suggestions in dashboard

### Phase 3: Enhanced Features (Week 5-6)
- [ ] Speaker diarization
- [ ] Real-time suggestion generation
- [ ] Agent feedback loop (which suggestions were useful)
- [ ] Post-call summary generation
- [ ] Analytics and reporting

### Phase 4: Optimization (Week 7-8)
- [ ] Performance optimization
- [ ] Error handling and retry logic
- [ ] Agent dashboard UX improvements
- [ ] Mobile-responsive design
- [ ] Load testing and scaling

---

## Integration with Existing Cascading Server

Your existing cascading server already handles:
- VAPI webhook events
- Database operations
- API endpoints

**Additions Needed:**
1. New `/monitoring/*` endpoints
2. WebSocket server for agent dashboard
3. Integration with transcription service
4. AI analysis pipeline

**File Structure:**
```
cascading-forward-server/
├── src/
│   ├── monitoring/
│   │   ├── vapi-monitor.ts           # WebSocket to VAPI listenUrl
│   │   ├── transcription-service.ts  # Deepgram integration
│   │   ├── ai-analysis-engine.ts     # LLM-based analysis
│   │   └── agent-dashboard-ws.ts     # WebSocket for dashboard
│   ├── routes/
│   │   ├── monitoring.routes.ts      # New monitoring endpoints
│   │   └── vapi-webhook.routes.ts    # Enhanced webhook handler
│   └── models/
│       ├── monitored-call.model.ts
│       └── transcript.model.ts
├── agent-dashboard/                   # Next.js app
│   ├── pages/
│   │   ├── index.tsx                 # Agent login
│   │   └── call/[callId].tsx         # Live monitoring dashboard
│   └── components/
│       ├── TranscriptDisplay.tsx
│       ├── SuggestionPanel.tsx
│       └── CustomerContext.tsx
```

---

## Cost Estimation

### Monthly Costs (1000 calls/month, 10min avg)

| Service | Usage | Cost |
|---------|-------|------|
| VAPI | 1000 calls × 10min | ~$300 |
| Deepgram Transcription | 167 hours audio | ~$250 |
| OpenAI API (Analysis) | ~500K tokens | ~$10 |
| Hosting (Server + Dashboard) | | ~$50 |
| **Total** | | **~$610/month** |

---

## Success Metrics

1. **Agent Efficiency**
   - Time to resolution (before vs after)
   - First-call resolution rate
   - Agent satisfaction score

2. **Customer Experience**
   - Customer satisfaction (CSAT)
   - Average handling time
   - Escalation rate

3. **System Performance**
   - Transcription accuracy
   - Latency (speech to dashboard display)
   - Suggestion relevance (agent feedback)
   - System uptime

---

## Security Considerations

1. **Data Privacy**
   - Encrypt all call recordings and transcripts
   - Implement data retention policies
   - Comply with GDPR/CCPA regulations
   - Secure WebSocket connections (WSS)

2. **Access Control**
   - Agent authentication (SSO)
   - Role-based access to call recordings
   - Audit logs for all data access

3. **PCI Compliance**
   - Never transcribe or store credit card numbers
   - Implement PCI DSS controls if handling payment info
   - Redact sensitive information from transcripts

---

## Conclusion

While VAPI doesn't support the exact feature your client requested (AI agent staying on call silently), this architecture achieves the **same business outcome**:

✅ Human agents get real-time transcription
✅ AI provides intelligent suggestions during calls
✅ Full call context is preserved
✅ Customer experience remains excellent
✅ System is maintainable and scalable

This approach is **better** than having AI on the call because:
- Cleaner architecture (works with VAPI's design)
- More flexible AI analysis (not limited to real-time constraints)
- Better agent experience (dashboard with suggestions)
- Easier to debug and maintain
- Can use more powerful AI models without latency concerns

Next step: Review this architecture with your client and get approval to proceed with implementation.