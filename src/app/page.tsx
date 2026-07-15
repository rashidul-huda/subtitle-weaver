"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, Download, Settings2, Film, Type, ListFilter, AlertCircle, Loader2, Wand2, Droplets, Volume2, Activity, Target } from 'lucide-react';
import { FileUploadInput } from '@/components/custom/file-upload-input';

const PREVIEW_TEXT = "Aa Bb Gg Yy 0123 Zz. Quick brown fox.";
const FONT_STYLE_TAG_ID = "custom-font-preview-style";
const TARGET_VIDEO_WIDTH = 1920;
const TARGET_VIDEO_HEIGHT = 1080;
const TARGET_BITRATE = 20000000;

interface WordTiming {
  id: number;
  text: string;
  timestamp: number;
  duration: number;
}

interface SubtitleLine {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  words?: WordTiming[];
}

interface Particle {
  x: number; y: number;
  size: number;
  opacity: number;
  vx: number; vy: number;
}


function parseSRT(srtContent: string): SubtitleLine[] {
  const entries: SubtitleLine[] = [];
  const lines = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  let idCounter = 0;
  for (const block of lines) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n');
    if (blockLines.length < 2) continue; // Skip blocks without enough lines (number, time, text)

    // const id = blockLines[0]; // We don't use the ID for now
    const timeString = blockLines[1];
    const textLines = blockLines.slice(2).join('\n');

    if (!timeString || !textLines) continue;


    const timeParts = timeString.split(' --> ');
    if (timeParts.length !== 2) continue;

    const parseTime = (timeStr: string): number => {
      const [hms, msStr] = timeStr.split(',');
      const [h, m, s] = hms.split(':').map(Number);
      return h * 3600 + m * 60 + s + Number(msStr) / 1000;
    };

    try {
      const startTime = parseTime(timeParts[0]);
      const endTime = parseTime(timeParts[1]);
      entries.push({ id: idCounter++, startTime, endTime, text: textLines });
    } catch (e) {
      console.error("Error parsing time in SRT block:", timeString, e);
      // Skip this entry if time parsing fails
    }
  }
  return entries;
}

function parseJSONLyrics(jsonContent: string): SubtitleLine[] {
  const parsed = JSON.parse(jsonContent);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON must be an array of subtitle lines.");
  }
  
  return parsed.map((item: any, index: number) => {
    if (!item.words || !Array.isArray(item.words) || item.words.length === 0) {
      return {
        id: item.id ?? index,
        startTime: item.startTime ?? item.timestamp ?? 0,
        endTime: item.endTime ?? (item.timestamp ? item.timestamp + (item.duration ?? 2) : 2),
        text: item.text ?? "",
      };
    }

    const words: WordTiming[] = item.words.map((w: any, wIndex: number) => ({
      id: w.id ?? wIndex,
      text: w.text ?? "",
      timestamp: Number(w.timestamp),
      duration: Number(w.duration),
    })).sort((a: WordTiming, b: WordTiming) => a.timestamp - b.timestamp);

    const startTime = words[0].timestamp;
    const lastWord = words[words.length - 1];
    const endTime = lastWord.timestamp + lastWord.duration;
    const text = words.map(w => w.text).join(' ');

    return {
      id: item.id ?? index,
      startTime,
      endTime,
      text,
      words,
    };
  });
}

function drawWaveformHelper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dataArray: Uint8Array,
  style: string,
  color: string,
  opacity: number
) {
  ctx.save();
  ctx.globalAlpha = opacity / 100;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  const bufferLength = dataArray.length;

  if (style === 'bars') {
    const barWidth = width / bufferLength;
    const halfLength = Math.floor(bufferLength / 2);

    for (let i = 0; i < bufferLength; i++) {
      let dataIndex;
      if (i < halfLength) {
        dataIndex = halfLength - 1 - i;
      } else {
        dataIndex = i - halfLength;
      }

      const bin = Math.min(bufferLength - 1, Math.floor(dataIndex * 0.85));
      const value = (dataArray[bin] || 0) / 255.0;
      const barHeight = value * height;
      
      const x = i * barWidth;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
    }
  } else if (style === 'line') {
    ctx.beginPath();
    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  } else if (style === 'wave') {
    const barWidth = width / bufferLength;
    const halfLength = Math.floor(bufferLength / 2);

    for (let i = 0; i < bufferLength; i++) {
      let dataIndex;
      if (i < halfLength) {
        dataIndex = halfLength - 1 - i;
      } else {
        dataIndex = i - halfLength;
      }

      const bin = Math.min(bufferLength - 1, Math.floor(dataIndex * 0.85));
      const value = (dataArray[bin] || 0) / 255.0;
      const barHeight = value * height * 0.8;
      const y = (height - barHeight) / 2;
      
      const x = i * barWidth;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
  }

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  
  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = currentLine ? currentLine + ' ' + words[n] : words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        lines.push(currentLine);
        currentLine = words[n];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

function wrapWordTimings(
  ctx: CanvasRenderingContext2D,
  words: WordTiming[],
  maxWidth: number,
  textCase: string,
  fontSize: number
): WordTiming[][] {
  const lines: WordTiming[][] = [];
  let currentLine: WordTiming[] = [];
  let currentWidth = 0;
  
  const spaceWidth = Math.max(ctx.measureText(' ').width, fontSize * 0.25);

  words.forEach((word) => {
    let t = word.text;
    if (textCase === 'uppercase') t = t.toUpperCase();
    else if (textCase === 'lowercase') t = t.toLowerCase();

    const wordWidth = ctx.measureText(t).width;
    
    const testWidth = currentLine.length === 0 
      ? wordWidth 
      : currentWidth + spaceWidth + wordWidth;

    if (testWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [word];
      currentWidth = wordWidth;
    } else {
      currentLine.push(word);
      currentWidth = testWidth;
    }
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function getDeterministicRandom(seedStr: string): (offset: number) => number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (offset: number) => {
    const x = Math.sin(hash + offset) * 10000;
    return x - Math.floor(x);
  };
}

interface TextLayout {
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  baseline: 'top' | 'middle' | 'bottom';
  transform: string;
}

function getDeterministicLayout(
  seedStr: string,
  left: number = 8,
  right: number = 92,
  top: number = 8,
  bottom: number = 92
): TextLayout {
  const rand = getDeterministicRandom(seedStr);
  const positionIndex = Math.floor(rand(1) * 9); // 0 to 8
  
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  let x = midX;
  let y = midY;
  let align: 'left' | 'center' | 'right' = 'center';
  let baseline: 'top' | 'middle' | 'bottom' = 'middle';
  let transform = 'translate(-50%, -50%)';

  switch (positionIndex) {
    case 0: // Top Left
      x = left; y = top; align = 'left'; baseline = 'top'; transform = 'translate(0, 0)';
      break;
    case 1: // Top Center
      x = midX; y = top; align = 'center'; baseline = 'top'; transform = 'translate(-50%, 0)';
      break;
    case 2: // Top Right
      x = right; y = top; align = 'right'; baseline = 'top'; transform = 'translate(-100%, 0)';
      break;
    case 3: // Mid Left
      x = left; y = midY; align = 'left'; baseline = 'middle'; transform = 'translate(0, -50%)';
      break;
    case 4: // Center
      x = midX; y = midY; align = 'center'; baseline = 'middle'; transform = 'translate(-50%, -50%)';
      break;
    case 5: // Mid Right
      x = right; y = midY; align = 'right'; baseline = 'middle'; transform = 'translate(-100%, -50%)';
      break;
    case 6: // Bottom Left
      x = left; y = bottom; align = 'left'; baseline = 'bottom'; transform = 'translate(0, -100%)';
      break;
    case 7: // Bottom Center
      x = midX; y = bottom; align = 'center'; baseline = 'bottom'; transform = 'translate(-50%, -100%)';
      break;
    case 8: // Bottom Right
      x = right; y = bottom; align = 'right'; baseline = 'bottom'; transform = 'translate(-100%, -100%)';
      break;
  }

  return { x, y, align, baseline, transform };
}


export default function SubtitleWeaverPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleEntries, setSubtitleEntries] = useState<SubtitleLine[]>([]);

  const [fontSize, setFontSize] = useState<number>(72);
  const [positionX, setPositionX] = useState<number>(50);
  const [positionY, setPositionY] = useState<number>(90);
  const [subtitleMaxWidth, setSubtitleMaxWidth] = useState<number>(85);
  const [showOutline, setShowOutline] = useState<boolean>(true);
  const [randomizePositions, setRandomizePositions] = useState<boolean>(false);
  const [randomBoundaryLeft, setRandomBoundaryLeft] = useState<number>(10);
  const [randomBoundaryRight, setRandomBoundaryRight] = useState<number>(90);
  const [randomBoundaryTop, setRandomBoundaryTop] = useState<number>(10);
  const [randomBoundaryBottom, setRandomBoundaryBottom] = useState<number>(90);
  const [textCase, setTextCase] = useState<string>('normal');
  const [textOpacity, setTextOpacity] = useState<number>(100);
  const [textEffect, setTextEffect] = useState<string>('none');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [outlineColor, setOutlineColor] = useState<string>('#000000');

  const [highlightColor, setHighlightColor] = useState<string>('#fbbf24');
  const [highlightStyle, setHighlightStyle] = useState<string>('karaoke');
  const [previewTime, setPreviewTime] = useState<number>(0);

  const [burnAudio, setBurnAudio] = useState<boolean>(true);
  const [showWaveform, setShowWaveform] = useState<boolean>(false);
  const [waveformStyle, setWaveformStyle] = useState<string>('bars');
  const [waveformColor, setWaveformColor] = useState<string>('#fbbf24');
  const [waveformPositionX, setWaveformPositionX] = useState<number>(50);
  const [waveformPositionY, setWaveformPositionY] = useState<number>(80);
  const [waveformWidth, setWaveformWidth] = useState<number>(80);
  const [waveformHeight, setWaveformHeight] = useState<number>(80);
  const [waveformOpacity, setWaveformOpacity] = useState<number>(80);
  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [processedVideoFilename, setProcessedVideoFilename] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const [previewFontFamily, setPreviewFontFamily] = useState<string>("'Inter', sans-serif");
  const [loadedFontName, setLoadedFontName] = useState<string | null>(null);

  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastSubRef = useRef<string | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewAnimationRef = useRef<number | null>(null);

  const initPreviewAnalyser = () => {
    if (!videoRef.current || analyserRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const source = ctx.createMediaElementSource(videoRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (e) {
      console.error("Failed to initialize audio analyser:", e);
    }
  };

  const handlePreviewPlay = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    initPreviewAnalyser();
  };

  // Smoothly update previewTime at 60 FPS while the video is playing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animationFrameId: number;
    const update = () => {
      if (!video.paused && !video.ended) {
        setPreviewTime(video.currentTime);
      }
      animationFrameId = requestAnimationFrame(update);
    };

    const handlePlay = () => {
      animationFrameId = requestAnimationFrame(update);
    };

    const handlePause = () => {
      cancelAnimationFrame(animationFrameId);
    };

    const handleSeeking = () => {
      setPreviewTime(video.currentTime);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);

    if (!video.paused && !video.ended) {
      animationFrameId = requestAnimationFrame(update);
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoPreviewUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTrackDisable = () => {
      if (video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'disabled';
        }
      }
    };

    handleTrackDisable();
    
    video.addEventListener('play', handleTrackDisable);
    video.addEventListener('playing', handleTrackDisable);
    video.addEventListener('seeking', handleTrackDisable);
    video.addEventListener('seeked', handleTrackDisable);
    video.addEventListener('loadedmetadata', handleTrackDisable);
    video.addEventListener('loadeddata', handleTrackDisable);

    const timer = setTimeout(handleTrackDisable, 500);

    return () => {
      video.removeEventListener('play', handleTrackDisable);
      video.removeEventListener('playing', handleTrackDisable);
      video.removeEventListener('seeking', handleTrackDisable);
      video.removeEventListener('seeked', handleTrackDisable);
      video.removeEventListener('loadedmetadata', handleTrackDisable);
      video.removeEventListener('loadeddata', handleTrackDisable);
      clearTimeout(timer);
    };
  }, [videoPreviewUrl]);


  useEffect(() => {
    let url: string | null = null;
    if (videoFile) {
      url = URL.createObjectURL(videoFile);
      setVideoPreviewUrl(url);
      setProcessedVideoUrl(null); // Clear previous processed video
      setProcessedVideoFilename(null);
    } else {
      setVideoPreviewUrl(url);
    }
    
    return () => {
      if (url) URL.revokeObjectURL(url);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      sourceRef.current = null;
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
    };
  }, [videoFile]);

  useEffect(() => {
    const oldStyleTag = document.getElementById(FONT_STYLE_TAG_ID);
    if (oldStyleTag) {
      oldStyleTag.remove();
    }
    setLoadedFontName(null);

    if (fontFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const newFontFamilyName = `customPreviewFont_${Date.now()}`;
        setLoadedFontName(newFontFamilyName);
        
        const styleEl = document.createElement('style');
        styleEl.id = FONT_STYLE_TAG_ID;
        styleEl.innerHTML = `
          @font-face {
            font-family: '${newFontFamilyName}';
            src: url(${dataUrl});
          }
        `;
        document.head.appendChild(styleEl);
        setPreviewFontFamily(`'${newFontFamilyName}', 'Inter', sans-serif`);
      };
      reader.readAsDataURL(fontFile);
    } else {
      setPreviewFontFamily("'Inter', sans-serif");
    }

    return () => {
      const styleTag = document.getElementById(FONT_STYLE_TAG_ID);
      if (styleTag) {
        styleTag.remove();
      }
    };
  }, [fontFile]);

  useEffect(() => {
    if (subtitleFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const content = reader.result as string;
        const isJson = subtitleFile.name.toLowerCase().endsWith('.json');
        try {
          if (isJson) {
            const parsed = parseJSONLyrics(content);
            setSubtitleEntries(parsed);
            if (parsed.length === 0 && content.trim() !== "") {
              toast({ title: "JSON Parsing Issue", description: "JSON file might be empty or improperly formatted.", variant: "destructive"});
            }
          } else {
            const parsed = parseSRT(content);
            setSubtitleEntries(parsed);
            if (parsed.length === 0 && content.trim() !== "") {
               toast({ title: "SRT Parsing Issue", description: "SRT file might be empty or improperly formatted. No subtitles parsed.", variant: "destructive"});
            }
          }
        } catch (e) {
          console.error("Failed to parse subtitle file:", e);
          toast({ title: "Parsing Error", description: "Could not parse the subtitle/lyrics file. Please check its format.", variant: "destructive"});
          setSubtitleEntries([]);
        }
      };
      reader.onerror = () => {
         toast({ title: "File Read Error", description: "Could not read the subtitle file.", variant: "destructive"});
         setSubtitleEntries([]);
      }
      reader.readAsText(subtitleFile);
    } else {
      setSubtitleEntries([]);
    }
  }, [subtitleFile, toast]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    
    if (!video || !canvas || !showWaveform) {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderPreviewWaveform = () => {
      const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 128;
      const dataArray = new Uint8Array(bufferLength);

      const isAudible = !video.paused && !video.ended && analyserRef.current;

      if (isAudible && analyserRef.current) {
        const analyser = analyserRef.current;
        if (waveformStyle === 'line') {
          analyser.getByteTimeDomainData(dataArray);
        } else {
          analyser.getByteFrequencyData(dataArray);
        }
      } else {
        // Generate mock data for static preview
        if (waveformStyle === 'line') {
          for (let i = 0; i < bufferLength; i++) {
            dataArray[i] = 128 + Math.sin(i * 0.15) * 30;
          }
        } else {
          for (let i = 0; i < bufferLength; i++) {
            const factor = Math.sin((i / bufferLength) * Math.PI);
            dataArray[i] = factor * (120 + Math.sin(i * 0.5) * 40);
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawWaveformHelper(
        ctx,
        canvas.width,
        canvas.height,
        dataArray,
        waveformStyle,
        waveformColor,
        waveformOpacity
      );

      previewAnimationRef.current = requestAnimationFrame(renderPreviewWaveform);
    };

    renderPreviewWaveform();

    return () => {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
    };
  }, [showWaveform, waveformStyle, waveformColor, waveformOpacity]);


  const handleBurnVideoClientSide = async () => {
    if (!videoFile || !subtitleFile) {
      toast({ title: "Missing Files", description: "Please upload video and subtitle/lyrics files.", variant: "destructive" });
      return;
    }
    if (!videoRef.current) {
        toast({ title: "Video Player Error", description: "Video player element not found.", variant: "destructive" });
        return;
    }

    setIsProcessing(true);
    setProcessingError(null);
    setProcessedVideoUrl(null);
    setProcessedVideoFilename(null);
    setProcessingProgress(0);
    lastSubRef.current = null;
    particlesRef.current = [];

    const videoElement = document.createElement('video');
    const videoBlobUrl = URL.createObjectURL(videoFile);
    videoElement.src = videoBlobUrl;
    // Keep muted false so audio flows into AudioContext, which will stay silent to user
    videoElement.muted = false; 

    const canvas = canvasRef.current || document.createElement('canvas');
    if (!canvasRef.current) {
    }
    canvas.width = TARGET_VIDEO_WIDTH;
    canvas.height = TARGET_VIDEO_HEIGHT;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      toast({ title: "Canvas Error", description: "Could not get canvas context.", variant: "destructive" });
      setIsProcessing(false);
      return;
    }

    let burnerAudioCtx: AudioContext | null = null;
    let burnerAnalyser: AnalyserNode | null = null;
    let burnerSource: MediaElementAudioSourceNode | null = null;
    let burnerDest: MediaStreamAudioDestinationNode | null = null;

    if (burnAudio || showWaveform) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        burnerAudioCtx = new AudioContextClass();
        burnerAnalyser = burnerAudioCtx.createAnalyser();
        burnerAnalyser.fftSize = 256;
        
        burnerSource = burnerAudioCtx.createMediaElementSource(videoElement);
        burnerSource.connect(burnerAnalyser);
        
        if (burnAudio) {
          burnerDest = burnerAudioCtx.createMediaStreamDestination();
          burnerAnalyser.connect(burnerDest);
        }
      } catch (e) {
        console.error("Failed to initialize audio routing for burner:", e);
      }
    }

    const mediaChunks: BlobPart[] = [];
    let recorder: MediaRecorder;

    try {
      const canvasStream = canvas.captureStream(30);
      let combinedStream = canvasStream;

      if (burnAudio && burnerDest) {
        const audioTracks = burnerDest.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          combinedStream = new MediaStream([
            canvasStream.getVideoTracks()[0],
            audioTracks[0]
          ]);
        }
      }

      recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: TARGET_BITRATE,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(mediaChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setProcessedVideoUrl(url);
        setProcessedVideoFilename(`subtitled_${videoFile.name.split('.')[0] || 'video'}.webm`);
        setIsProcessing(false);
        setProcessingProgress(100);
        toast({ title: "Processing Complete!", description: "Your video is ready for download." });
        URL.revokeObjectURL(videoBlobUrl);
        
        if (burnerAudioCtx) {
          burnerAudioCtx.close().catch(console.error);
        }
      };
      
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        const error = "Unknown MediaRecorder error";
        setProcessingError(`MediaRecorder error: ${error}`);
        toast({ title: "Recording Error", description: `An error occurred during video recording: ${error}`, variant: "destructive" });
        setIsProcessing(false);
        if (recorder.state !== "inactive") recorder.stop();

        if (burnerAudioCtx) {
          burnerAudioCtx.close().catch(console.error);
        }
      };

    } catch (e: any) {
        console.error("Error setting up MediaRecorder:", e);
        setProcessingError(`Setup error: ${e.message}`);
        toast({ title: "Setup Error", description: `Could not initialize video recorder: ${e.message}`, variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    

    videoElement.onloadedmetadata = async () => {
        await document.fonts.ready;
        recorder.start();
        videoElement.play();

        function renderFrame() {
          if (videoElement.paused || videoElement.ended || recorder.state === "inactive") {
            if (recorder.state === "recording") recorder.stop();
            return;
          }
          
          const currentTime = videoElement.currentTime;
          const duration = videoElement.duration;
          if (duration > 0) {
            const progress = Math.min(100, Math.floor((currentTime / duration) * 100));
            setProcessingProgress(progress);
          }

          const activeSub = subtitleEntries.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
          const currentSubText = activeSub ? activeSub.text : null;
          if (currentSubText !== lastSubRef.current) {
              particlesRef.current = [];
              lastSubRef.current = currentSubText;
          }

          // Draw background first
          if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0,0, canvas.width, canvas.height);
          }

          // Scale video to fit 1080p canvas while maintaining aspect ratio
          const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
          let drawWidth = canvas.width;
          let drawHeight = canvas.width / videoAspectRatio;
          if (drawHeight > canvas.height) {
              drawHeight = canvas.height;
              drawWidth = canvas.height * videoAspectRatio;
          }
          const offsetX = (canvas.width - drawWidth) / 2;
          const offsetY = (canvas.height - drawHeight) / 2;
          
          if (ctx) {
            ctx.drawImage(videoElement, offsetX, offsetY, drawWidth, drawHeight);
          }

          // Render waveform on canvas
          if (showWaveform && burnerAnalyser && ctx) {
            const bufferLength = burnerAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            if (waveformStyle === 'line') {
              burnerAnalyser.getByteTimeDomainData(dataArray);
            } else {
              burnerAnalyser.getByteFrequencyData(dataArray);
            }

            const wWidth = canvas.width * (waveformWidth / 100);
            const wHeight = waveformHeight;
            const wX = canvas.width * (waveformPositionX / 100) - wWidth / 2;
            const wY = canvas.height * (waveformPositionY / 100) - wHeight / 2;

            ctx.save();
            ctx.translate(wX, wY);
            
            drawWaveformHelper(
              ctx,
              wWidth,
              wHeight,
              dataArray,
              waveformStyle,
              waveformColor,
              waveformOpacity
            );
            
            ctx.restore();
          }

          // Render subtitles
          if (activeSub) {
            if (ctx) {
              ctx.globalAlpha = textOpacity / 100;
              
              let textX = canvas.width * (positionX / 100);
              let textY = canvas.height * (positionY / 100);
              let alignSetting: 'left' | 'center' | 'right' = 'center';
              let baselineSetting: 'top' | 'middle' | 'bottom' = 'middle';

              if (randomizePositions) {
                const layout = getDeterministicLayout(
                  `sub_${activeSub.id}_${activeSub.text.length}`,
                  randomBoundaryLeft,
                  randomBoundaryRight,
                  randomBoundaryTop,
                  randomBoundaryBottom
                );
                textX = canvas.width * (layout.x / 100);
                textY = canvas.height * (layout.y / 100);
                alignSetting = layout.align;
                baselineSetting = layout.baseline;
              }

              const fontSetting = `${fontSize}px "${loadedFontName || 'Inter'}", sans-serif`;
              const maxW = canvas.width * (subtitleMaxWidth / 100);

              if (activeSub.words && activeSub.words.length > 0) {
                // Word-by-word drawing with wrapping
                // Use textAlign='left' because we manually compute each word's X position.
                // The alignSetting is applied in the manual currentX calculation below.
                ctx.font = fontSetting;
                ctx.textAlign = 'left';
                ctx.textBaseline = baselineSetting;

                const wrappedWordLines = wrapWordTimings(ctx, activeSub.words, maxW, textCase, fontSize);
                const lineGap = fontSize * 1.2;
                
                let startY = textY;
                if (baselineSetting === 'middle') {
                  startY = textY - ((wrappedWordLines.length - 1) * lineGap) / 2;
                } else if (baselineSetting === 'bottom') {
                  startY = textY - (wrappedWordLines.length - 1) * lineGap;
                }

                wrappedWordLines.forEach((lineWords, lineIndex) => {
                  const currentLineY = startY + lineIndex * lineGap;

                  const formattedWords = lineWords.map(w => {
                    let t = w.text;
                    if (textCase === 'uppercase') t = t.toUpperCase();
                    else if (textCase === 'lowercase') t = t.toLowerCase();
                    return { ...w, text: t };
                  });

                  const spaceWidth = Math.max(ctx.measureText(' ').width, fontSize * 0.25);
                  const wordWidths = formattedWords.map(w => ctx.measureText(w.text).width);
                  const totalWidth = wordWidths.reduce((sum, w) => sum + w, 0) + spaceWidth * (formattedWords.length - 1);

                  let currentX = textX;
                  if (alignSetting === 'center') {
                    currentX = textX - totalWidth / 2;
                  } else if (alignSetting === 'right') {
                    currentX = textX - totalWidth;
                  }

                  formattedWords.forEach((word, wordIndex) => {
                    const wordWidth = wordWidths[wordIndex];
                    const isFuture = currentTime < word.timestamp;
                    const isActive = currentTime >= word.timestamp && currentTime <= word.timestamp + word.duration;
                    const isPast = currentTime > word.timestamp + word.duration;

                    let color = textColor;
                    let opacity = 1;

                    if (highlightStyle === 'karaoke') {
                      if (isActive || isPast) {
                        color = highlightColor;
                      }
                    } else if (highlightStyle === 'single') {
                      if (isActive) {
                        color = highlightColor;
                      }
                    } else if (highlightStyle === 'progressive') {
                      if (isFuture) {
                        opacity = 0;
                      } else if (isActive) {
                        color = highlightColor;
                      }
                    }

                    if (opacity > 0) {
                      ctx.fillStyle = color;
                      const originalGlobalAlpha = ctx.globalAlpha;
                      ctx.globalAlpha = originalGlobalAlpha * opacity;

                      if (showOutline) {
                        ctx.strokeStyle = outlineColor;
                        ctx.lineWidth = Math.max(1, fontSize / 15);
                        ctx.strokeText(word.text, currentX, currentLineY);
                      }
                      ctx.fillText(word.text, currentX, currentLineY);

                      ctx.globalAlpha = originalGlobalAlpha;
                    }

                    // Particle smoke effect per word line
                    if (textEffect === 'smoke' && isActive) {
                      particlesRef.current.push({
                        x: currentX + Math.random() * wordWidth,
                        y: currentLineY - (fontSize * 0.25) + (Math.random() - 0.5) * (fontSize * 0.5),
                        size: Math.random() * (fontSize / 15) + 2,
                        opacity: Math.random() * 0.4 + 0.1,
                        vx: (Math.random() - 0.5) * 0.5,
                        vy: -Math.random() * 0.8 - 0.2,
                      });
                    }

                    currentX += wordWidth + spaceWidth;
                  });
                });
              } else {
                // Static centered drawing with wrapping
                ctx.font = fontSetting;
                ctx.textAlign = alignSetting;
                ctx.textBaseline = baselineSetting;
                ctx.fillStyle = textColor;
                
                let subText = activeSub.text;
                if (textCase === 'uppercase') subText = subText.toUpperCase();
                else if (textCase === 'lowercase') subText = subText.toLowerCase();

                const wrappedLines = wrapText(ctx, subText, maxW);
                const lineGap = fontSize * 1.2;
                
                let startY = textY;
                if (baselineSetting === 'middle') {
                  startY = textY - ((wrappedLines.length - 1) * lineGap) / 2;
                } else if (baselineSetting === 'bottom') {
                  startY = textY - (wrappedLines.length - 1) * lineGap;
                }

                wrappedLines.forEach((line, lineIndex) => {
                  const currentLineY = startY + lineIndex * lineGap;

                  if (showOutline) {
                     ctx.strokeStyle = outlineColor;
                     ctx.lineWidth = Math.max(1, fontSize / 15);
                     ctx.strokeText(line, textX, currentLineY);
                  }
                  ctx.fillText(line, textX, currentLineY);
                  
                  if (textEffect === 'smoke') {
                    const textMetrics = ctx.measureText(line);
                    const textWidth = textMetrics.width;
                    for (let i = 0; i < 3; i++) {
                      particlesRef.current.push({
                        x: textX - textWidth / 2 + Math.random() * textWidth,
                        y: currentLineY - (fontSize * 0.25) + (Math.random() - 0.5) * (fontSize * 0.5),
                        size: Math.random() * (fontSize / 15) + 2,
                        opacity: Math.random() * 0.4 + 0.1,
                        vx: (Math.random() - 0.5) * 0.5,
                        vy: -Math.random() * 0.8 - 0.2,
                      });
                    }
                  }
                });
              }

              ctx.textBaseline = 'alphabetic';
              ctx.globalAlpha = 1; // Reset alpha for other elements
            }
          }

           // Update and draw all particles for smoke effect
          if (particlesRef.current.length > 0 && ctx) {
              ctx.fillStyle = `rgba(220, 220, 220, 1)`; // Smoke color
              particlesRef.current.forEach((p, index) => {
                  p.x += p.vx; p.y += p.vy; p.opacity -= 0.008; p.size *= 0.98;
                  if (p.opacity <= 0 || p.size <= 0.5) {
                      particlesRef.current.splice(index, 1);
                  } else {
                      ctx.globalAlpha = p.opacity; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
                  }
              });
              ctx.globalAlpha = 1; // IMPORTANT: Reset alpha after drawing all particles
          }

          requestAnimationFrame(renderFrame);
        }
        renderFrame();
    };

    videoElement.onerror = () => {
        const errorMsg = videoElement.error?.message || "Unknown video load error";
        toast({ title: "Video Load Error", description: `Error loading video for processing: ${errorMsg}`, variant: "destructive" });
        setProcessingError(`Video load error: ${errorMsg}`);
        setIsProcessing(false);
        if (recorder && recorder.state === "recording") recorder.stop();
        URL.revokeObjectURL(videoBlobUrl);

        if (burnerAudioCtx) {
          burnerAudioCtx.close().catch(console.error);
        }
    };
  };
  
  const canSubmit = !!videoFile && !!subtitleFile && !isProcessing;

  const activePreviewSub = subtitleEntries.find(
    s => previewTime >= s.startTime && previewTime <= s.endTime
  );

  let displayedPreviewSub = activePreviewSub;
  if (!displayedPreviewSub && subtitleEntries.length > 0 && previewTime === 0) {
    displayedPreviewSub = subtitleEntries[0];
  }

  const getSubLayout = () => {
    if (!randomizePositions || !displayedPreviewSub) return null;
    return getDeterministicLayout(
      `sub_${displayedPreviewSub.id}_${displayedPreviewSub.text.length}`,
      randomBoundaryLeft,
      randomBoundaryRight,
      randomBoundaryTop,
      randomBoundaryBottom
    );
  };

  const layoutCoords = getSubLayout();

  const subtitlePreviewStyle: React.CSSProperties = {
    position: 'absolute',
    left: layoutCoords ? `${layoutCoords.x}%` : `${positionX}%`,
    top: layoutCoords ? `${layoutCoords.y}%` : `${positionY}%`,
    opacity: textOpacity / 100,
    transform: layoutCoords ? layoutCoords.transform : 'translate(-50%, -50%)',
    fontSize: `${fontSize / (TARGET_VIDEO_HEIGHT / (videoRef.current?.clientHeight || TARGET_VIDEO_HEIGHT))}px`, // Scale font size for preview
    fontFamily: previewFontFamily,
    color: textColor,
    textShadow: showOutline ? `-1px -1px 0 ${outlineColor}, 1px -1px 0 ${outlineColor}, -1px 1px 0 ${outlineColor}, 1px 1px 0 ${outlineColor}, 0px 0px ${fontSize/20}px ${outlineColor}` : 'none',
    textAlign: layoutCoords ? layoutCoords.align : 'center',
    width: `${subtitleMaxWidth}%`,
    maxWidth: 'none',
    pointerEvents: 'none',
    lineHeight: '1.2',
    whiteSpace: 'pre-wrap',
    zIndex: 10,
    textTransform: textCase === 'uppercase' ? 'uppercase' : textCase === 'lowercase' ? 'lowercase' : 'none',
  };

  const renderPreviewSub = () => {
    if (!displayedPreviewSub) {
      return previewTime === 0 ? PREVIEW_TEXT : "";
    }
    
    if (!displayedPreviewSub.words || displayedPreviewSub.words.length === 0) {
      let subText = displayedPreviewSub.text;
      if (textCase === 'uppercase') subText = subText.toUpperCase();
      else if (textCase === 'lowercase') subText = subText.toLowerCase();
      return <span style={{ color: textColor }}>{subText}</span>;
    }

    const justifyClass = layoutCoords
      ? layoutCoords.align === 'left' 
        ? 'justify-start' 
        : layoutCoords.align === 'right' 
          ? 'justify-end' 
          : 'justify-center'
      : 'justify-center';

    return (
      <span className={`inline-flex flex-wrap ${justifyClass} gap-x-[0.25em] w-full`}>
        {displayedPreviewSub.words.map((word, index) => {
          const isFuture = previewTime < word.timestamp;
          const isActive = previewTime >= word.timestamp && previewTime <= word.timestamp + word.duration;
          const isPast = previewTime > word.timestamp + word.duration;

          let color = textColor;
          let opacity = 1;

          if (highlightStyle === 'karaoke') {
            if (isActive || isPast) {
              color = highlightColor;
            }
          } else if (highlightStyle === 'single') {
            if (isActive) {
              color = highlightColor;
            }
          } else if (highlightStyle === 'progressive') {
            if (isFuture) {
              opacity = 0;
            } else if (isActive) {
              color = highlightColor;
            }
          }

          let text = word.text;
          if (textCase === 'uppercase') text = text.toUpperCase();
          else if (textCase === 'lowercase') text = text.toLowerCase();

          return (
            <span
              key={index}
              style={{
                color,
                opacity,
                transition: highlightStyle === 'progressive' ? 'none' : 'color 0.15s ease, opacity 0.15s ease',
              }}
            >
              {text}
            </span>
          );
        })}
      </span>
    );
  };


  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 selection:bg-accent selection:text-accent-foreground">
      <header className="w-full max-w-6xl mb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-headline font-bold text-primary">Subtitle Weaver</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Craft perfectly subtitled videos directly in your browser. Upload, customize, and download.
        </p>
      </header>
      
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>


      <div className="w-full max-w-6xl">
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="bg-card">
                <CardTitle className="flex items-center gap-2 text-xl"><UploadCloud size={24} className="text-primary" /> File Uploads</CardTitle>
                <CardDescription>Provide your video, subtitles, and font.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <FileUploadInput id="video-upload" label="Video File" accept="video/*" icon={<Film size={18} />} onFileChange={setVideoFile} fileName={videoFile?.name} />
                <FileUploadInput id="font-upload" label="Font File (.ttf)" accept=".ttf" icon={<Type size={18} />} onFileChange={setFontFile} fileName={fontFile?.name}/>
                <FileUploadInput id="srt-upload" label="Subtitle / Lyrics File (.srt, .json)" accept=".srt,.json" icon={<ListFilter size={18} />} onFileChange={setSubtitleFile} fileName={subtitleFile?.name}/>
              </CardContent>
            </Card>

            <Card className="shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="bg-card">
                <CardTitle className="flex items-center gap-2 text-xl"><Settings2 size={24} className="text-primary" /> Subtitle Settings</CardTitle>
                <CardDescription>Adjust font size, position, and visual effects.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="space-y-2">
                  <Label htmlFor="font-size" className="flex justify-between"><span>Font Size (for 1080p):</span> <span>{fontSize}px</span></Label>
                  <Slider id="font-size" name="fontSize" min={12} max={200} step={1} value={[fontSize]} onValueChange={(value) => setFontSize(value[0])} aria-label={`Font size: ${fontSize} pixels`} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position-x" className="flex justify-between"><span>Horizontal Position (X):</span> <span>{positionX}%</span></Label>
                  <Slider id="position-x" name="positionX" min={0} max={100} step={1} value={[positionX]} onValueChange={(value) => setPositionX(value[0])} aria-label={`Subtitle X position: ${positionX} percent from left`} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position-y" className="flex justify-between"><span>Vertical Position (Y):</span> <span>{positionY}%</span></Label>
                  <Slider id="position-y" name="positionY" min={0} max={100} step={1} value={[positionY]} onValueChange={(value) => setPositionY(value[0])} aria-label={`Subtitle Y position: ${positionY} percent from top`} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtitle-max-width" className="flex justify-between"><span>Subtitle Max Width:</span> <span>{subtitleMaxWidth}%</span></Label>
                  <Slider id="subtitle-max-width" name="subtitleMaxWidth" min={30} max={100} step={1} value={[subtitleMaxWidth]} onValueChange={(value) => setSubtitleMaxWidth(value[0])} aria-label={`Subtitle maximum width: ${subtitleMaxWidth} percent of video width`} />
                </div>
                <div className="flex items-center justify-between space-x-2 pt-2">
                  <Label htmlFor="show-outline" className="text-sm">Show Subtitle Outline</Label>
                  <Switch id="show-outline" name="showOutline" checked={showOutline} onCheckedChange={setShowOutline} aria-label="Toggle subtitle outline"/>
                </div>
                 <div className="flex items-center justify-between space-x-2 pt-2">
                  <Label htmlFor="randomize-positions" className="text-sm">Random & Bouncing Positions</Label>
                  <Switch id="randomize-positions" name="randomizePositions" checked={randomizePositions} onCheckedChange={setRandomizePositions} aria-label="Toggle random and bouncing positions"/>
                </div>
                {randomizePositions && (
                  <div className="space-y-3 p-3 bg-muted/40 rounded-lg border border-border mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                      <Target size={14} />
                      Random Position Boundary Box
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="flex justify-between text-[11px] font-medium">
                        <span>Horizontal Limits:</span>
                        <span>{randomBoundaryLeft}% - {randomBoundaryRight}%</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="random-boundary-left" className="text-[10px] text-muted-foreground block">Min X</Label>
                          <Slider
                            id="random-boundary-left"
                            min={0}
                            max={Math.max(0, randomBoundaryRight - 5)}
                            step={1}
                            value={[randomBoundaryLeft]}
                            onValueChange={(val) => setRandomBoundaryLeft(val[0])}
                            aria-label="Minimum random horizontal percent"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="random-boundary-right" className="text-[10px] text-muted-foreground block">Max X</Label>
                          <Slider
                            id="random-boundary-right"
                            min={Math.min(100, randomBoundaryLeft + 5)}
                            max={100}
                            step={1}
                            value={[randomBoundaryRight]}
                            onValueChange={(val) => setRandomBoundaryRight(val[0])}
                            aria-label="Maximum random horizontal percent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex justify-between text-[11px] font-medium">
                        <span>Vertical Limits:</span>
                        <span>{randomBoundaryTop}% - {randomBoundaryBottom}%</span>
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="random-boundary-top" className="text-[10px] text-muted-foreground block">Min Y</Label>
                          <Slider
                            id="random-boundary-top"
                            min={0}
                            max={Math.max(0, randomBoundaryBottom - 5)}
                            step={1}
                            value={[randomBoundaryTop]}
                            onValueChange={(val) => setRandomBoundaryTop(val[0])}
                            aria-label="Minimum random vertical percent"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="random-boundary-bottom" className="text-[10px] text-muted-foreground block">Max Y</Label>
                          <Slider
                            id="random-boundary-bottom"
                            min={Math.min(100, randomBoundaryTop + 5)}
                            max={100}
                            step={1}
                            value={[randomBoundaryBottom]}
                            onValueChange={(val) => setRandomBoundaryBottom(val[0])}
                            aria-label="Maximum random vertical percent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                 <div className="space-y-2 pt-2">
                  <Label htmlFor="text-opacity" className="flex justify-between items-center"><span className="flex items-center gap-2"><Droplets size={16}/> Opacity:</span> <span>{textOpacity}%</span></Label>
                  <Slider id="text-opacity" min={0} max={100} step={1} value={[textOpacity]} onValueChange={(value) => setTextOpacity(value[0])} aria-label={`Text opacity: ${textOpacity} percent`} />
                </div>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="text-effect" className="flex items-center gap-2"><Wand2 size={16}/> Text Effect</Label>
                  <Select value={textEffect} onValueChange={setTextEffect}>
                    <SelectTrigger id="text-effect" aria-label="Select text effect">
                      <SelectValue placeholder="Select effect" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="smoke">Smoke</SelectItem>
                    </SelectContent>
                  </Select>
                   {textEffect === 'smoke' && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Smoke is a complex effect only visible in the final rendered video.
                    </p>
                  )}
                </div>
                 <div className="space-y-2 pt-2">
                  <Label htmlFor="text-case">Text Case</Label>
                  <Select value={textCase} onValueChange={setTextCase} name="textCase">
                    <SelectTrigger id="text-case" aria-label="Select text case">
                      <SelectValue placeholder="Select text case" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="uppercase">ALL CAPS</SelectItem>
                      <SelectItem value="lowercase">all small</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="text-color">Base Text Color</Label>
                  <Select value={textColor} onValueChange={setTextColor}>
                    <SelectTrigger id="text-color" aria-label="Select base text color">
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="#ffffff">White</SelectItem>
                      <SelectItem value="#f3f4f6">Off-White</SelectItem>
                      <SelectItem value="#d1d5db">Light Gray</SelectItem>
                      <SelectItem value="#fbbf24">Gold</SelectItem>
                      <SelectItem value="#06b6d4">Neon Cyan</SelectItem>
                      <SelectItem value="#22c55e">Neon Green</SelectItem>
                      <SelectItem value="#ec4899">Hot Pink</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="outline-color">Border / Outline Color</Label>
                  <Select value={outlineColor} onValueChange={setOutlineColor}>
                    <SelectTrigger id="outline-color" aria-label="Select outline color">
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="#000000">Black</SelectItem>
                      <SelectItem value="#1f2937">Dark Gray</SelectItem>
                      <SelectItem value="#ffffff">White</SelectItem>
                      <SelectItem value="#fbbf24">Gold</SelectItem>
                      <SelectItem value="#06b6d4">Neon Cyan</SelectItem>
                      <SelectItem value="#22c55e">Neon Green</SelectItem>
                      <SelectItem value="#ec4899">Hot Pink</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {subtitleEntries.some(e => e.words && e.words.length > 0) && (
                  <>
                    <div className="space-y-2 pt-2">
                      <Label htmlFor="highlight-style">Highlight Style</Label>
                      <Select value={highlightStyle} onValueChange={setHighlightStyle}>
                        <SelectTrigger id="highlight-style" aria-label="Select highlight style">
                          <SelectValue placeholder="Select style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="karaoke">Karaoke (Accumulative)</SelectItem>
                          <SelectItem value="single">Single Word Highlight</SelectItem>
                          <SelectItem value="progressive">Progressive Reveal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Label htmlFor="highlight-color">Highlight Color</Label>
                      <Select value={highlightColor} onValueChange={setHighlightColor}>
                        <SelectTrigger id="highlight-color" aria-label="Select highlight color">
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="#fbbf24">Gold</SelectItem>
                          <SelectItem value="#06b6d4">Neon Cyan</SelectItem>
                          <SelectItem value="#22c55e">Neon Green</SelectItem>
                          <SelectItem value="#ec4899">Hot Pink</SelectItem>
                          <SelectItem value="#ffffff">White (No Highlight)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="bg-card">
                <CardTitle className="flex items-center gap-2 text-xl"><Volume2 size={24} className="text-primary" /> Audio & Waveform</CardTitle>
                <CardDescription>Configure audio and dynamic visualization settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between space-x-2 pt-2">
                  <Label htmlFor="burn-audio" className="text-sm font-medium">Include Video Audio</Label>
                  <Switch id="burn-audio" name="burnAudio" checked={burnAudio} onCheckedChange={setBurnAudio} aria-label="Toggle audio inclusion in final output" />
                </div>

                <div className="flex items-center justify-between space-x-2 pt-2 border-t">
                  <Label htmlFor="show-waveform" className="text-sm font-medium flex items-center gap-2">
                    <Activity size={16} className="text-primary" /> Add Audio Waveform
                  </Label>
                  <Switch id="show-waveform" name="showWaveform" checked={showWaveform} onCheckedChange={setShowWaveform} aria-label="Toggle waveform overlay on preview and output" />
                </div>

                {showWaveform && (
                  <div className="space-y-4 pt-4 border-t animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-2">
                      <Label htmlFor="waveform-style">Waveform Appearance</Label>
                      <Select value={waveformStyle} onValueChange={setWaveformStyle}>
                        <SelectTrigger id="waveform-style" aria-label="Select waveform style">
                          <SelectValue placeholder="Select style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bars">Equalizer Bars</SelectItem>
                          <SelectItem value="line">Oscilloscope Line</SelectItem>
                          <SelectItem value="wave">Symmetrical Wave</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-color">Waveform Color</Label>
                      <Select value={waveformColor} onValueChange={setWaveformColor}>
                        <SelectTrigger id="waveform-color" aria-label="Select waveform color">
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="#fbbf24">Gold</SelectItem>
                          <SelectItem value="#06b6d4">Neon Cyan</SelectItem>
                          <SelectItem value="#22c55e">Neon Green</SelectItem>
                          <SelectItem value="#ec4899">Hot Pink</SelectItem>
                          <SelectItem value="#ffffff">White</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-position-x" className="flex justify-between"><span>Position (X):</span> <span>{waveformPositionX}%</span></Label>
                      <Slider id="waveform-position-x" min={0} max={100} step={1} value={[waveformPositionX]} onValueChange={(value) => setWaveformPositionX(value[0])} aria-label={`Waveform X position: ${waveformPositionX} percent`} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-position-y" className="flex justify-between"><span>Position (Y):</span> <span>{waveformPositionY}%</span></Label>
                      <Slider id="waveform-position-y" min={0} max={100} step={1} value={[waveformPositionY]} onValueChange={(value) => setWaveformPositionY(value[0])} aria-label={`Waveform Y position: ${waveformPositionY} percent`} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-width" className="flex justify-between"><span>Width (Length):</span> <span>{waveformWidth}%</span></Label>
                      <Slider id="waveform-width" min={10} max={100} step={1} value={[waveformWidth]} onValueChange={(value) => setWaveformWidth(value[0])} aria-label={`Waveform width: ${waveformWidth} percent`} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-height" className="flex justify-between"><span>Height:</span> <span>{waveformHeight}px</span></Label>
                      <Slider id="waveform-height" min={20} max={200} step={5} value={[waveformHeight]} onValueChange={(value) => setWaveformHeight(value[0])} aria-label={`Waveform height: ${waveformHeight} pixels`} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="waveform-opacity" className="flex justify-between"><span>Opacity:</span> <span>{waveformOpacity}%</span></Label>
                      <Slider id="waveform-opacity" min={10} max={100} step={5} value={[waveformOpacity]} onValueChange={(value) => setWaveformOpacity(value[0])} aria-label={`Waveform opacity: ${waveformOpacity} percent`} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6 lg:sticky lg:top-8 h-fit">
            <Card className="shadow-xl rounded-xl overflow-hidden h-full flex flex-col">
              <CardHeader className="bg-card">
                <CardTitle className="text-xl">Video Preview & Output</CardTitle>
                 <CardDescription>See your uploaded video. Processed video will be available for download.</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex flex-col items-center justify-center space-y-4 p-6">
                <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden border border-border shadow-inner relative">
                  {videoPreviewUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={videoPreviewUrl}
                        controls
                        onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
                        onPlay={handlePreviewPlay}
                        className="w-full h-full object-contain"
                        aria-label="Uploaded video preview"
                      ></video>
                      
                      {showWaveform && (
                        <canvas
                          ref={previewCanvasRef}
                          width={800}
                          height={150}
                          style={{
                            position: 'absolute',
                            left: `${waveformPositionX}%`,
                            top: `${waveformPositionY}%`,
                            transform: 'translate(-50%, -50%)',
                            width: `${waveformWidth}%`,
                            height: `${waveformHeight}px`,
                            pointerEvents: 'none',
                            zIndex: 5,
                          }}
                        />
                      )}
                      <div style={subtitlePreviewStyle} aria-hidden="true">
                        {renderPreviewSub()}
                      </div>
                      {randomizePositions && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${randomBoundaryLeft}%`,
                            width: `${randomBoundaryRight - randomBoundaryLeft}%`,
                            top: `${randomBoundaryTop}%`,
                            height: `${randomBoundaryBottom - randomBoundaryTop}%`,
                            border: '2px dashed rgba(59, 130, 246, 0.45)',
                            backgroundColor: 'rgba(59, 130, 246, 0.03)',
                            pointerEvents: 'none',
                            zIndex: 4,
                            transition: 'all 0.1s ease',
                          }}
                          aria-hidden="true"
                        >
                          <span className="absolute bottom-1 right-1.5 text-[9px] font-mono px-1 py-0.5 rounded bg-blue-500/70 text-white select-none">
                            Random Bounds
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground p-4" data-ai-hint="video placeholder">
                      <Film size={64} className="mx-auto mb-4 opacity-50" />
                      <p className="font-medium">Video preview will appear here</p>
                      <p className="text-sm">Upload a video file to get started.</p>
                    </div>
                  )}
                </div>
                
                {processingError && (
                  <p role="alert" className="p-3 bg-destructive/10 text-destructive border border-destructive rounded-md text-sm w-full flex items-center gap-2">
                    <AlertCircle size={18} /> {processingError}
                  </p>
                )}

              </CardContent>
              <CardFooter className="p-6 border-t bg-card">
                <div className="w-full space-y-3">
                  <div className="p-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg text-sm flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-semibold text-amber-500 mb-1 text-xs">Important Tab Visibility Warning</h5>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Do <strong>not</strong> close the tab, switch tabs, or minimize the window while processing/exporting is active. The browser throttles background canvas processing, which will ruin the video recording.
                      </p>
                    </div>
                  </div>

                   <Button
                    onClick={handleBurnVideoClientSide}
                    disabled={!canSubmit}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 text-base rounded-lg"
                  >
                    {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Weaving Subtitles ({processingProgress}%)...
                        </>
                      ) : (
                        "Burn Subtitles & Create Video"
                      )}
                  </Button>

                  {processedVideoUrl && processedVideoFilename && (
                    <a
                      href={processedVideoUrl}
                      download={processedVideoFilename}
                      className="w-full block"
                      aria-label="Download processed video"
                    >
                      <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10 py-3 text-base font-semibold rounded-lg">
                        <Download className="mr-2 h-5 w-5" /> Download Processed Video (.webm)
                      </Button>
                    </a>
                  )}
                </div>
              </CardFooter>
            </Card>
          </div>
        </main>
      </div>

      <footer className="w-full max-w-6xl mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Subtitle Weaver. All rights reserved.</p>
        <p className="text-xs mt-1">Video processing occurs in your browser. Performance depends on your computer.</p>
      </footer>
    </div>
  );
}
