# Subtitle Weaver

A powerful, browser-based tool for burning subtitles directly onto your videos. Craft perfectly subtitled videos with custom fonts, styles, and effects, all without uploading your files to a server.

## Overview

Subtitle Weaver is a client-side video processing application built with Next.js and React. It leverages modern browser APIs like the Canvas and MediaRecorder APIs to perform all video manipulation directly on the user's machine. This privacy-focused approach means your video files are never sent to a server, ensuring your data remains secure.

Users can upload a video file, a custom font (`.ttf`), and a subtitle file (`.srt`). They can then customize the appearance of the subtitles with an interactive live preview, adjusting font size, position, opacity, and more. When ready, the application renders the video with the subtitles burned-in and provides a high-quality WEBM file for download.

## Features

- **Client-Side Processing**: All video rendering happens in your browser. No server uploads required.
- **Custom Fonts**: Upload your own `.ttf` font file for complete brand consistency.
- **Live Preview**: See your subtitle customizations in real-time on the video preview.
- **Rich Customization**:
  - Adjust font size.
  - Control horizontal (X) and vertical (Y) positioning.
  - Set text opacity.
  - Toggle a text outline for better visibility.
  - Change text casing (Normal, ALL CAPS, all small).
- **Visual Effects**: Apply a "Smoke" effect to your subtitles for a creative touch.
- **High-Quality Output**: Renders video in 1080p WEBM format with a 20 Mbps bitrate.

## Technology Stack

- **Framework**: Next.js 15 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: ShadCN UI
- **Icons**: Lucide React
- **Video Processing**: Browser Canvas API & MediaRecorder API

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.x or higher is recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/subtitle-weaver.git
    cd subtitle-weaver
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```
    or
    ```sh
    yarn install
    ```

3.  **Run the development server:**
    ```sh
    npm run dev
    ```

4.  **Open the application:**
    Open [http://localhost:9002](http://localhost:9002) with your browser to see the result.

The application is now running in development mode. You can start by uploading a video, an SRT file, and an optional font file to see it in action.

## How It Works

The application uses the browser's built-in capabilities to process video.

1.  **File Handling**: When you upload files, they are stored in the browser's memory.
2.  **SRT Parsing**: The `.srt` file is parsed into a structured format of timestamps and text.
3.  **Canvas Rendering**: When you click "Burn Subtitles", a hidden `<canvas>` element is used as a rendering surface. For each frame of the source video:
    - The video frame is drawn onto the canvas.
    - If a subtitle is active for that timestamp, it's drawn on top of the video frame using your custom settings (font, size, position, effects).
4.  **Video Encoding**: The `MediaRecorder` API captures the stream from the canvas, encoding it into a new WEBM video file in real-time.
5.  **Download**: Once the source video has finished playing through, the recorded WEBM data is compiled into a Blob, and a download link is generated for you.
