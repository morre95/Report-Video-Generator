# Report Video Generator

Transform reports and documents into animated video presentations with AI-generated narration.

## Features

- **Generation History** — Browse past jobs in the History panel. Metadata is saved under `.runtime/jobs/` (newest 50 kept) and survives server restarts; click an entry to reload its preview/downloads.
- **Output Modes** — Choose **Video**, **PowerPoint**, or **Both**. PowerPoint decks include native charts, shapes, speaker notes, and up to 3 AI slide images via OpenRouter (`google/gemini-2.5-flash-image`; image charges apply). Completed decks can be browsed slide-by-slide in the preview panel before download.
- **Multi-Document Upload** — Drag-and-drop up to 10 PDF, DOCX, TXT, or Markdown files (20 MB each, 50 MB combined). Sources are deduplicated and text is balanced across a 200K-character budget so later files are not discarded.
- **AI Analysis** — Gemini 3.5 Flash through OpenRouter extracts key metrics, charts, and creates a narration script
- **Optional Web Research** — Tick "Allow online research" to let the AI search the web for supplementary context. Uploaded documents remain the primary source. Adds a small OpenRouter web-search charge per query.
- **Voiceover** — Gemini 3.1 Flash TTS through OpenRouter generates professional narration with configurable voices
- **Animated Compositions** — Hyperframes renders HTML/CSS/GSAP compositions with charts, KPIs, and transitions
- **Background Music** — Selectable background music mixed at reduced volume under the voiceover
- **Smart Duration** — Auto mode fits the finished story to 30–180 seconds from its narration and scene count; Manual mode supports 15–300 seconds
- **Configurable** — Aspect ratio (16:9, 4:3, 9:16, 1:1), FPS, and voice selection
- **NVIDIA Demo** — Pre-loaded Q1 FY2027 earnings demo

## Requirements

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — `sudo apt install ffmpeg` (Debian/Ubuntu) or `brew install ffmpeg` (macOS)
- **OpenRouter API Key** — [OpenRouter Keys](https://openrouter.ai/keys) with available credits

## Setup

```bash
# Install dependencies
npm install

# Copy environment template and add your API key
cp .env.example .env.local
# Edit .env.local with your OPENROUTER_API_KEY

# Verify Hyperframes dependencies
npx hyperframes doctor

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Upload one or more reports (up to 10 files) or click **Load NVIDIA Q1 FY2027 Demo**
2. Write a presentation brief describing the story you want
3. Choose **Output**: Video, PowerPoint, or Both
4. Optionally enable **Allow online research** for supplementary web context (adds OpenRouter search charges)
5. Keep the recommended **Auto** duration or choose **Manual**, then adjust aspect ratio and (for video) FPS, voice, and background music
6. Click **Generate Video**
7. Preview the video and/or browse PowerPoint slides in the UI, then download the MP4 / PowerPoint file
8. Open **History** to revisit earlier generations (persisted across restarts)

## Architecture

```
src/
  app/                    # Next.js App Router
    api/
      jobs/               # Job creation and status polling
      demo/               # NVIDIA demo data endpoint
    page.tsx              # Main UI
  lib/
    config/               # Server-only configuration
    documents/            # PDF, DOCX, TXT extraction
    gemini/                 # Presentation analysis and TTS orchestration
      analyze.ts          # Report → structured presentation JSON
      tts.ts              # Narration → voiceover audio
    openrouter/
      client.ts           # OpenRouter authentication, models, and errors
      images.ts           # OpenRouter image generation for PPTX slides
    pptx/
      build-pptx.ts       # Presentation data → PowerPoint (.pptx)
      preview.ts          # Slide image paths for in-app PPTX preview
    hyperframes/
      build-composition.ts  # Presentation data → animated HTML
      render.ts             # HTML → MP4 via Hyperframes CLI
    jobs/                 # In-memory + disk-backed job store (.runtime/jobs)
data/demos/               # Pre-built demo fixtures
public/audio/             # Background music (lofi7.mp3)
.runtime/                 # Uploads, compositions, audio, images, pptx, jobs, renders (gitignored)
```
