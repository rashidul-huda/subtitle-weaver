"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { 
  UploadCloud, Download, Settings2, Film, Type, ListFilter, 
  AlertCircle, Loader2, Wand2, Droplets, Volume2, Activity, Target,
  Sparkles, Palette, RefreshCw, FolderHeart, LayoutGrid, MonitorPlay
} from 'lucide-react';
import { FileUploadInput } from '@/components/custom/file-upload-input';
import { ColorPickerCustom } from '@/components/custom/color-picker-custom';
import { WordTiming, SubtitleLine, parseSRT, parseJSONLyrics } from '@/lib/subtitle-parser';
import { getDeterministicLayout, wrapText, wrapWordTimings, findActiveSubtitle } from '@/lib/layout-utils';

const PREVIEW_TEXT = "Aa Bb Gg Yy 0123 Zz. Quick brown fox.";
const FONT_STYLE_TAG_ID = "custom-font-preview-style";

const DEFAULT_VIDEO_WIDTH = 1920;
const DEFAULT_VIDEO_HEIGHT = 1080;
const DEFAULT_BITRATE = 20000000;

async function fetchFile(file: File | Blob | string): Promise<Uint8Array> {
  if (typeof file === 'string') {
    const response = await fetch(file);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        resolve(new Uint8Array());
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsArrayBuffer(file);
  });
}

async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

interface Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  vx: number;
  vy: number;
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

// Layout and wrapping utilities are imported from '@/lib/layout-utils'


export default function SubtitleWeaverPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleEntries, setSubtitleEntries] = useState<SubtitleLine[]>([]);

  // Style and rendering options
  const [fontSize, setFontSize] = useState<number>(72);
  const [positionX, setPositionX] = useState<number>(50);
  const [positionY, setPositionY] = useState<number>(90);
  const [subtitleMaxWidth, setSubtitleMaxWidth] = useState<number>(85);
  const [showOutline, setShowOutline] = useState<boolean>(true);
  const [outlineThickness, setOutlineThickness] = useState<number>(5);
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

  // Text Shadow / Glow settings
  const [showShadow, setShowShadow] = useState<boolean>(false);
  const [shadowColor, setShadowColor] = useState<string>('rgba(0,0,0,0.6)');
  const [shadowBlur, setShadowBlur] = useState<number>(6);
  const [shadowOffsetX, setShadowOffsetX] = useState<number>(3);
  const [shadowOffsetY, setShadowOffsetY] = useState<number>(3);

  // Background options
  const [showBackground, setShowBackground] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  // Style Alternation (Multi-line styling support)
  const [alternateLineStyles, setAlternateLineStyles] = useState<string>('none');
  const [alternateColor, setAlternateColor] = useState<string>('#fbbf24');

  // Highlights and timing styling
  const [highlightColor, setHighlightColor] = useState<string>('#fbbf24');
  const [highlightStyle, setHighlightStyle] = useState<string>('karaoke');
  const [previewTime, setPreviewTime] = useState<number>(0);

  // Audio settings
  const [burnAudio, setBurnAudio] = useState<boolean>(true);
  const [showWaveform, setShowWaveform] = useState<boolean>(false);
  const [waveformStyle, setWaveformStyle] = useState<string>('bars');
  const [waveformColor, setWaveformColor] = useState<string>('#fbbf24');
  const [waveformPositionX, setWaveformPositionX] = useState<number>(50);
  const [waveformPositionY, setWaveformPositionY] = useState<number>(80);
  const [waveformWidth, setWaveformWidth] = useState<number>(80);
  const [waveformHeight, setWaveformHeight] = useState<number>(80);
  const [waveformOpacity, setWaveformOpacity] = useState<number>(80);

  // Dynamic Export configurations
  const [exportFormat, setExportFormat] = useState<string>('webm');
  const [exportResolution, setExportResolution] = useState<string>('1080p');
  const [exportBitrate, setExportBitrate] = useState<string>('medium');
  const [exportFps, setExportFps] = useState<number>(30);

  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [transcodeProgress, setTranscodeProgress] = useState<number>(0);
  const [transcodeEta, setTranscodeEta] = useState<string | null>(null);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [processedVideoFilename, setProcessedVideoFilename] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const [previewFontFamily, setPreviewFontFamily] = useState<string>("'Inter', sans-serif");
  const [loadedFontName, setLoadedFontName] = useState<string | null>(null);

  const [customPresets, setCustomPresets] = useState<{name: string, config: any}[]>([]);

  // Load FFmpeg UMD scripts from local public directory dynamically to bypass Next.js Turbopack require-statement parsing errors and avoid CORS Worker security issues
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Load ffmpeg.js
    if (!(window as any).FFmpegWASM) {
      const script = document.createElement('script');
      script.src = '/ffmpeg/ffmpeg.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('subtitle-weaver-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.fontSize !== undefined) setFontSize(parsed.fontSize);
        if (parsed.positionX !== undefined) setPositionX(parsed.positionX);
        if (parsed.positionY !== undefined) setPositionY(parsed.positionY);
        if (parsed.subtitleMaxWidth !== undefined) setSubtitleMaxWidth(parsed.subtitleMaxWidth);
        if (parsed.showOutline !== undefined) setShowOutline(parsed.showOutline);
        if (parsed.outlineThickness !== undefined) setOutlineThickness(parsed.outlineThickness);
        if (parsed.randomizePositions !== undefined) setRandomizePositions(parsed.randomizePositions);
        if (parsed.randomBoundaryLeft !== undefined) setRandomBoundaryLeft(parsed.randomBoundaryLeft);
        if (parsed.randomBoundaryRight !== undefined) setRandomBoundaryRight(parsed.randomBoundaryRight);
        if (parsed.randomBoundaryTop !== undefined) setRandomBoundaryTop(parsed.randomBoundaryTop);
        if (parsed.randomBoundaryBottom !== undefined) setRandomBoundaryBottom(parsed.randomBoundaryBottom);
        if (parsed.textCase !== undefined) setTextCase(parsed.textCase);
        if (parsed.textOpacity !== undefined) setTextOpacity(parsed.textOpacity);
        if (parsed.textEffect !== undefined) setTextEffect(parsed.textEffect);
        if (parsed.textColor !== undefined) setTextColor(parsed.textColor);
        if (parsed.outlineColor !== undefined) setOutlineColor(parsed.outlineColor);
        
        if (parsed.showShadow !== undefined) setShowShadow(parsed.showShadow);
        if (parsed.shadowColor !== undefined) setShadowColor(parsed.shadowColor);
        if (parsed.shadowBlur !== undefined) setShadowBlur(parsed.shadowBlur);
        if (parsed.shadowOffsetX !== undefined) setShadowOffsetX(parsed.shadowOffsetX);
        if (parsed.shadowOffsetY !== undefined) setShadowOffsetY(parsed.shadowOffsetY);

        if (parsed.showBackground !== undefined) setShowBackground(parsed.showBackground);
        if (parsed.backgroundColor !== undefined) setBackgroundColor(parsed.backgroundColor);
        
        if (parsed.alternateLineStyles !== undefined) setAlternateLineStyles(parsed.alternateLineStyles);
        if (parsed.alternateColor !== undefined) setAlternateColor(parsed.alternateColor);
        
        if (parsed.highlightColor !== undefined) setHighlightColor(parsed.highlightColor);
        if (parsed.highlightStyle !== undefined) setHighlightStyle(parsed.highlightStyle);
        if (parsed.burnAudio !== undefined) setBurnAudio(parsed.burnAudio);
        if (parsed.showWaveform !== undefined) setShowWaveform(parsed.showWaveform);
        if (parsed.waveformStyle !== undefined) setWaveformStyle(parsed.waveformStyle);
        if (parsed.waveformColor !== undefined) setWaveformColor(parsed.waveformColor);
        if (parsed.waveformPositionX !== undefined) setWaveformPositionX(parsed.waveformPositionX);
        if (parsed.waveformPositionY !== undefined) setWaveformPositionY(parsed.waveformPositionY);
        if (parsed.waveformWidth !== undefined) setWaveformWidth(parsed.waveformWidth);
        if (parsed.waveformHeight !== undefined) setWaveformHeight(parsed.waveformHeight);
        if (parsed.waveformOpacity !== undefined) setWaveformOpacity(parsed.waveformOpacity);
        
        if (parsed.exportFormat !== undefined) setExportFormat(parsed.exportFormat);
        if (parsed.exportResolution !== undefined) setExportResolution(parsed.exportResolution);
        if (parsed.exportBitrate !== undefined) setExportBitrate(parsed.exportBitrate);
        if (parsed.exportFps !== undefined) setExportFps(parsed.exportFps);
      }
    } catch (e) {
      console.error("Error loading settings from localStorage:", e);
    }

    try {
      const savedPresets = localStorage.getItem('subtitle-weaver-presets');
      if (savedPresets) {
        setCustomPresets(JSON.parse(savedPresets));
      }
    } catch (e) {
      console.error("Error loading presets from localStorage:", e);
    }
  }, []);

  // Save settings when they change
  useEffect(() => {
    const config = {
      fontSize, positionX, positionY, subtitleMaxWidth, showOutline, outlineThickness,
      randomizePositions, randomBoundaryLeft, randomBoundaryRight, randomBoundaryTop, randomBoundaryBottom,
      textCase, textOpacity, textEffect, textColor, outlineColor,
      showShadow, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
      showBackground, backgroundColor, alternateLineStyles, alternateColor,
      highlightColor, highlightStyle, burnAudio, showWaveform, waveformStyle,
      waveformColor, waveformPositionX, waveformPositionY, waveformWidth, waveformHeight, waveformOpacity,
      exportFormat, exportResolution, exportBitrate, exportFps
    };
    localStorage.setItem('subtitle-weaver-settings', JSON.stringify(config));
  }, [
    fontSize, positionX, positionY, subtitleMaxWidth, showOutline, outlineThickness,
    randomizePositions, randomBoundaryLeft, randomBoundaryRight, randomBoundaryTop, randomBoundaryBottom,
    textCase, textOpacity, textEffect, textColor, outlineColor,
    showShadow, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    showBackground, backgroundColor, alternateLineStyles, alternateColor,
    highlightColor, highlightStyle, burnAudio, showWaveform, waveformStyle,
    waveformColor, waveformPositionX, waveformPositionY, waveformWidth, waveformHeight, waveformOpacity,
    exportFormat, exportResolution, exportBitrate, exportFps
  ]);

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
  const transcodeStartTimeRef = useRef<number | null>(null);

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
    let url: string | null = null;
    if (backgroundImageFile) {
      url = URL.createObjectURL(backgroundImageFile);
      setBackgroundImageUrl(url);
    } else {
      setBackgroundImageUrl(null);
    }
    
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [backgroundImageFile]);

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
    setTranscodeProgress(0);
    setTranscodeEta(null);
    transcodeStartTimeRef.current = null;
    lastSubRef.current = null;
    particlesRef.current = [];

    const videoElement = document.createElement('video');
    const videoBlobUrl = URL.createObjectURL(videoFile);
    videoElement.src = videoBlobUrl;
    // Keep muted false so audio flows into AudioContext, which will stay silent to user
    videoElement.muted = false; 

    // Dynamic resolution
    let targetWidth = 1920;
    let targetHeight = 1080;
    if (exportResolution === '720p') {
      targetWidth = 1280;
      targetHeight = 720;
    } else if (exportResolution === '1440p') {
      targetWidth = 2560;
      targetHeight = 1440;
    }

    // Dynamic bitrate
    let targetBitrate = 20000000;
    if (exportBitrate === 'low') {
      targetBitrate = 10000000;
    } else if (exportBitrate === 'high') {
      targetBitrate = 40000000;
    } else if (exportBitrate === 'ultra') {
      targetBitrate = 80000000;
    }

    // Preload background image if enabled
    let backgroundImg: HTMLImageElement | null = null;
    if (showBackground && backgroundImageUrl) {
      backgroundImg = new Image();
      backgroundImg.src = backgroundImageUrl;
      await new Promise((resolve) => {
        if (backgroundImg) {
          backgroundImg.onload = resolve;
          backgroundImg.onerror = resolve;
        } else {
          resolve(null);
        }
      });
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
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
      const canvasStream = canvas.captureStream(exportFps);
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

      let selectedMimeType = 'video/webm';
      const mimeTypesToTry = [
        'video/webm;codecs=h264',
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
      ];
      for (const mime of mimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }
      console.log("Selected recording MIME type:", selectedMimeType);

      recorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: targetBitrate,
        audioBitsPerSecond: 320000,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const webmBlob = new Blob(mediaChunks, { type: 'video/webm' });
        
        if (exportFormat === 'mp4') {
          setProcessingProgress(98);
          transcodeStartTimeRef.current = Date.now();
          setTranscodeEta("Calculating ETA...");
          toast({ title: "Converting to MP4...", description: "Please wait, transcoding video in-browser." });
          try {
            const globalWasm = (window as any).FFmpegWASM;
            
            if (!globalWasm) {
              throw new Error("FFmpeg libraries are still loading. Please wait a few seconds and try again.");
            }
            
            const { FFmpeg } = globalWasm;
            
            const ffmpeg = new FFmpeg();
            
            ffmpeg.on('log', ({ message }: { message: string }) => {
              console.log("FFmpeg Log:", message);
            });
            
            ffmpeg.on('progress', ({ progress }: { progress: number }) => {
              const percent = Math.round(progress * 100);
              console.log(`FFmpeg Conversion Progress: ${percent}%`);
              setTranscodeProgress(percent);
              setProcessingProgress(Math.floor(95 + progress * 5));
              
              const startTime = transcodeStartTimeRef.current;
              if (startTime && percent > 2) {
                const elapsedMs = Date.now() - startTime;
                const totalEstimatedMs = elapsedMs / progress;
                const remainingMs = totalEstimatedMs - elapsedMs;
                const remainingSec = Math.max(0, Math.round(remainingMs / 1000));
                
                if (remainingSec < 60) {
                  setTranscodeEta(`About ${remainingSec}s remaining`);
                } else {
                  const mins = Math.floor(remainingSec / 60);
                  const secs = remainingSec % 60;
                  setTranscodeEta(`About ${mins}m ${secs}s remaining`);
                }
              }
            });

            const origin = window.location.origin;
            await ffmpeg.load({
              coreURL: `${origin}/ffmpeg/ffmpeg-core.js`,
              wasmURL: `${origin}/ffmpeg/ffmpeg-core.wasm`,
            });
            
            await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
            
            await ffmpeg.exec([
              '-i', 'input.webm',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-c:a', 'aac',
              '-b:a', '320k',
              'output.mp4'
            ]);
            
            const data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([data as any], { type: 'video/mp4' });
            const url = URL.createObjectURL(mp4Blob);
            
            setProcessedVideoUrl(url);
            setProcessedVideoFilename(`subtitled_${videoFile.name.split('.')[0] || 'video'}.mp4`);
            toast({ title: "Processing Complete!", description: "Your MP4 video is ready for download." });
          } catch (e: any) {
            console.error("FFmpeg transcode error:", e);
            toast({ 
              title: "MP4 Conversion Failed", 
              description: `FFmpeg failed: ${e.message || e}. Downloading WebM fallback.`, 
              variant: "destructive" 
            });
            const url = URL.createObjectURL(webmBlob);
            setProcessedVideoUrl(url);
            setProcessedVideoFilename(`subtitled_${videoFile.name.split('.')[0] || 'video'}.webm`);
          }
        } else {
          const url = URL.createObjectURL(webmBlob);
          setProcessedVideoUrl(url);
          setProcessedVideoFilename(`subtitled_${videoFile.name.split('.')[0] || 'video'}.webm`);
          toast({ title: "Processing Complete!", description: "Your WebM video is ready for download." });
        }
        
        setIsProcessing(false);
        setProcessingProgress(100);
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

        let lastFrameTime = 0;
        const frameInterval = 1000 / exportFps;

        function renderFrame(timestamp?: number) {
          if (!timestamp) {
            requestAnimationFrame(renderFrame);
            return;
          }
          if (videoElement.paused || videoElement.ended || recorder.state === "inactive") {
            if (recorder.state === "recording") recorder.stop();
            return;
          }

          const elapsed = timestamp - lastFrameTime;
          if (elapsed < frameInterval) {
            requestAnimationFrame(renderFrame);
            return;
          }
          lastFrameTime = timestamp - (elapsed % frameInterval);
          
          const currentTime = videoElement.currentTime;
          const duration = videoElement.duration;
          if (duration > 0) {
            const progress = Math.min(100, Math.floor((currentTime / duration) * 100));
            setProcessingProgress(progress);
          }

          const activeSub = findActiveSubtitle(subtitleEntries, currentTime);
          const currentSubText = activeSub ? activeSub.text : null;
          if (currentSubText !== lastSubRef.current) {
              particlesRef.current = [];
              lastSubRef.current = currentSubText;
          }

          // Draw background first
          if (ctx) {
            if (showBackground) {
              if (backgroundImg && backgroundImg.complete) {
                ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
              } else {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
            } else {
              ctx.fillStyle = "black";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
          }

          // Scale video to fit canvas while maintaining aspect ratio
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

              // Upgraded: Scale Pop animation hook
              let hasScalePop = false;
              if (textEffect === 'scalePop') {
                const timeInSub = currentTime - activeSub.startTime;
                if (timeInSub < 0.25) {
                  hasScalePop = true;
                  const scale = 1 + 0.12 * Math.sin((timeInSub / 0.25) * Math.PI);
                  ctx.save();
                  ctx.translate(textX, textY);
                  ctx.scale(scale, scale);
                  ctx.translate(-textX, -textY);
                }
              }

              // Upgraded: Text Shadow / Glow
              if (showShadow) {
                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;
              }

              const fontSetting = `${fontSize}px "${loadedFontName || 'Inter'}", sans-serif`;
              const maxW = canvas.width * (subtitleMaxWidth / 100);

              if (activeSub.words && activeSub.words.length > 0) {
                // Word-by-word drawing with wrapping
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

                    // Upgraded: Multi-line alternating line colors
                    let color = textColor;
                    if (alternateLineStyles === 'alternate-color' && lineIndex % 2 === 1) {
                      color = alternateColor;
                    }

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

                    // Upgraded: Typewriter effect word hiding
                    if (textEffect === 'typewriter' && isFuture) {
                      opacity = 0;
                    }

                    if (opacity > 0) {
                      ctx.fillStyle = color;
                      const originalGlobalAlpha = ctx.globalAlpha;
                      ctx.globalAlpha = originalGlobalAlpha * opacity;

                      if (showOutline) {
                        ctx.strokeStyle = outlineColor;
                        ctx.lineWidth = outlineThickness;
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
                
                let subText = activeSub.text;
                if (textCase === 'uppercase') subText = subText.toUpperCase();
                else if (textCase === 'lowercase') subText = subText.toLowerCase();

                // Upgraded: Typewriter reveal effect for SRT lines
                if (textEffect === 'typewriter') {
                  const subDuration = activeSub.endTime - activeSub.startTime;
                  const percent = Math.min(1, (currentTime - activeSub.startTime) / (subDuration * 0.85 || 1));
                  const charsToShow = Math.floor(subText.length * percent);
                  subText = subText.substring(0, charsToShow);
                }

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

                  // Upgraded: Multi-line alternating coloring
                  let currentTextColor = textColor;
                  if (alternateLineStyles === 'alternate-color' && lineIndex % 2 === 1) {
                    currentTextColor = alternateColor;
                  }
                  ctx.fillStyle = currentTextColor;

                  if (showOutline) {
                     ctx.strokeStyle = outlineColor;
                     ctx.lineWidth = outlineThickness;
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

              // Upgraded: Reset shadow and pop properties
              if (showShadow) {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
              }

              if (hasScalePop) {
                ctx.restore();
              }

              ctx.textBaseline = 'alphabetic';
              ctx.globalAlpha = 1; // Reset alpha for other elements
            }
          }

          // Upgraded: Safe particle rendering loop (avoid loop splice bugs)
          if (particlesRef.current.length > 0 && ctx) {
              particlesRef.current = particlesRef.current.filter((p) => {
                  p.x += p.vx;
                  p.y += p.vy;
                  p.opacity -= 0.008;
                  p.size *= 0.98;
                  if (p.opacity <= 0 || p.size <= 0.5) {
                      return false;
                  }
                  ctx.globalAlpha = p.opacity;
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                  ctx.fill();
                  return true;
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

  const savePreset = (name: string) => {
    if (!name.trim()) return;
    const newPreset = {
      name,
      config: {
        fontSize, positionX, positionY, subtitleMaxWidth, showOutline, outlineThickness,
        randomizePositions, randomBoundaryLeft, randomBoundaryRight, randomBoundaryTop, randomBoundaryBottom,
        textCase, textOpacity, textEffect, textColor, outlineColor,
        showShadow, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
        showBackground, backgroundColor, alternateLineStyles, alternateColor,
        highlightColor, highlightStyle, burnAudio, showWaveform, waveformStyle,
        waveformColor, waveformPositionX, waveformPositionY, waveformWidth, waveformHeight, waveformOpacity
      }
    };
    const updated = [...customPresets.filter(p => p.name !== name), newPreset];
    setCustomPresets(updated);
    localStorage.setItem('subtitle-weaver-presets', JSON.stringify(updated));
    toast({ title: "Template Saved", description: `"${name}" style template is saved.` });
  };

  const loadPreset = (preset: any) => {
    const config = preset.config;
    if (config.fontSize !== undefined) setFontSize(config.fontSize);
    if (config.positionX !== undefined) setPositionX(config.positionX);
    if (config.positionY !== undefined) setPositionY(config.positionY);
    if (config.subtitleMaxWidth !== undefined) setSubtitleMaxWidth(config.subtitleMaxWidth);
    if (config.showOutline !== undefined) setShowOutline(config.showOutline);
    if (config.outlineThickness !== undefined) setOutlineThickness(config.outlineThickness);
    if (config.randomizePositions !== undefined) setRandomizePositions(config.randomizePositions);
    if (config.randomBoundaryLeft !== undefined) setRandomBoundaryLeft(config.randomBoundaryLeft);
    if (config.randomBoundaryRight !== undefined) setRandomBoundaryRight(config.randomBoundaryRight);
    if (config.randomBoundaryTop !== undefined) setRandomBoundaryTop(config.randomBoundaryTop);
    if (config.randomBoundaryBottom !== undefined) setRandomBoundaryBottom(config.randomBoundaryBottom);
    if (config.textCase !== undefined) setTextCase(config.textCase);
    if (config.textOpacity !== undefined) setTextOpacity(config.textOpacity);
    if (config.textEffect !== undefined) setTextEffect(config.textEffect);
    if (config.textColor !== undefined) setTextColor(config.textColor);
    if (config.outlineColor !== undefined) setOutlineColor(config.outlineColor);
    
    if (config.showShadow !== undefined) setShowShadow(config.showShadow);
    if (config.shadowColor !== undefined) setShadowColor(config.shadowColor);
    if (config.shadowBlur !== undefined) setShadowBlur(config.shadowBlur);
    if (config.shadowOffsetX !== undefined) setShadowOffsetX(config.shadowOffsetX);
    if (config.shadowOffsetY !== undefined) setShadowOffsetY(config.shadowOffsetY);

    if (config.showBackground !== undefined) setShowBackground(config.showBackground);
    if (config.backgroundColor !== undefined) setBackgroundColor(config.backgroundColor);
    
    if (config.alternateLineStyles !== undefined) setAlternateLineStyles(config.alternateLineStyles);
    if (config.alternateColor !== undefined) setAlternateColor(config.alternateColor);
    
    if (config.highlightColor !== undefined) setHighlightColor(config.highlightColor);
    if (config.highlightStyle !== undefined) setHighlightStyle(config.highlightStyle);
    if (config.burnAudio !== undefined) setBurnAudio(config.burnAudio);
    if (config.showWaveform !== undefined) setShowWaveform(config.showWaveform);
    if (config.waveformStyle !== undefined) setWaveformStyle(config.waveformStyle);
    if (config.waveformColor !== undefined) setWaveformColor(config.waveformColor);
    if (config.waveformPositionX !== undefined) setWaveformPositionX(config.waveformPositionX);
    if (config.waveformPositionY !== undefined) setWaveformPositionY(config.waveformPositionY);
    if (config.waveformWidth !== undefined) setWaveformWidth(config.waveformWidth);
    if (config.waveformHeight !== undefined) setWaveformHeight(config.waveformHeight);
    if (config.waveformOpacity !== undefined) setWaveformOpacity(config.waveformOpacity);

    toast({ title: "Template Loaded", description: `"${preset.name}" styles applied successfully.` });
  };

  const deletePreset = (name: string) => {
    const updated = customPresets.filter(p => p.name !== name);
    setCustomPresets(updated);
    localStorage.setItem('subtitle-weaver-presets', JSON.stringify(updated));
    toast({ title: "Template Deleted", description: `"${name}" template deleted.` });
  };

  const canSubmit = !!videoFile && !!subtitleFile && !isProcessing;

  const activePreviewSub = findActiveSubtitle(subtitleEntries, previewTime);

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

  // Dynamic preview scaling factor (ratio of preview height vs target 1080p height)
  const previewHeightRatio = (videoRef.current?.clientHeight || 450) / 1080;
  const previewStrokeWidth = (outlineThickness * previewHeightRatio);

  const subtitlePreviewStyle: React.CSSProperties = {
    position: 'absolute',
    left: layoutCoords ? `${layoutCoords.x}%` : `${positionX}%`,
    top: layoutCoords ? `${layoutCoords.y}%` : `${positionY}%`,
    opacity: textOpacity / 100,
    transform: layoutCoords ? layoutCoords.transform : 'translate(-50%, -50%)',
    fontSize: `${fontSize * previewHeightRatio}px`,
    fontFamily: previewFontFamily,
    color: textColor,
    WebkitTextStroke: showOutline ? `${previewStrokeWidth}px ${outlineColor}` : 'none',
    paintOrder: 'stroke fill',
    textShadow: showShadow
      ? `${shadowOffsetX * previewHeightRatio}px ${shadowOffsetY * previewHeightRatio}px ${shadowBlur * previewHeightRatio}px ${shadowColor}`
      : 'none',
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
    
    // Static text or SRT subtitles preview rendering
    if (!displayedPreviewSub.words || displayedPreviewSub.words.length === 0) {
      let subText = displayedPreviewSub.text;
      if (textCase === 'uppercase') subText = subText.toUpperCase();
      else if (textCase === 'lowercase') subText = subText.toLowerCase();

      // Typewriter reveal in preview
      if (textEffect === 'typewriter' && activePreviewSub) {
        const subDuration = activePreviewSub.endTime - activePreviewSub.startTime;
        const percent = Math.min(1, (previewTime - activePreviewSub.startTime) / (subDuration * 0.85 || 1));
        const charsToShow = Math.floor(subText.length * percent);
        subText = subText.substring(0, charsToShow);
      }

      const previewLines = subText.split('\n');
      return (
        <span className="flex flex-col items-center w-full">
          {previewLines.map((line, lineIndex) => {
            let color = textColor;
            if (alternateLineStyles === 'alternate-color' && lineIndex % 2 === 1) {
              color = alternateColor;
            }
            return (
              <span key={lineIndex} style={{ color }} className="block">
                {line}
              </span>
            );
          })}
        </span>
      );
    }

    // Word-by-word timing JSON subtitles preview rendering
    const justifyClass = layoutCoords
      ? layoutCoords.align === 'left' 
        ? 'items-start text-left' 
        : layoutCoords.align === 'right' 
          ? 'items-end text-right' 
          : 'items-center text-center'
      : 'items-center text-center';

    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext('2d');
    let wrappedPreviewLines: WordTiming[][] = [displayedPreviewSub.words];
    
    if (canvasCtx) {
      canvasCtx.font = `${fontSize}px "${loadedFontName || 'Inter'}", sans-serif`;
      const canvasMaxW = 1920 * (subtitleMaxWidth / 100);
      wrappedPreviewLines = wrapWordTimings(canvasCtx, displayedPreviewSub.words, canvasMaxW, textCase, fontSize);
    }

    return (
      <div className={`flex flex-col ${justifyClass} w-full`}>
        {wrappedPreviewLines.map((lineWords, lineIndex) => {
          let lineAlignClass = 'justify-center';
          if (layoutCoords) {
            if (layoutCoords.align === 'left') lineAlignClass = 'justify-start';
            else if (layoutCoords.align === 'right') lineAlignClass = 'justify-end';
          }
          
          return (
            <div key={lineIndex} className={`flex flex-wrap ${lineAlignClass} gap-x-[0.25em] w-full`}>
              {lineWords.map((word, index) => {
                const isFuture = previewTime < word.timestamp;
                const isActive = previewTime >= word.timestamp && previewTime <= word.timestamp + word.duration;
                const isPast = previewTime > word.timestamp + word.duration;

                // Alternate line colors
                let color = textColor;
                if (alternateLineStyles === 'alternate-color' && lineIndex % 2 === 1) {
                  color = alternateColor;
                }
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

                // Typewriter effect word hiding
                if (textEffect === 'typewriter' && isFuture) {
                  opacity = 0;
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
            </div>
          );
        })}
      </div>
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
                <FileUploadInput id="font-upload" label="Font File (.ttf, .otf, .woff)" accept=".ttf,.otf,.woff,.woff2" icon={<Type size={18} />} onFileChange={setFontFile} fileName={fontFile?.name}/>
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

                {/* Upgraded: Outline Settings */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="show-outline" className="text-sm font-medium">Show Subtitle Outline</Label>
                    <Switch id="show-outline" name="showOutline" checked={showOutline} onCheckedChange={setShowOutline} aria-label="Toggle subtitle outline"/>
                  </div>
                  {showOutline && (
                    <div className="space-y-3 pl-3 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="space-y-2">
                        <Label htmlFor="outline-thickness" className="flex justify-between text-xs">
                          <span>Outline Thickness:</span> <span>{outlineThickness}px</span>
                        </Label>
                        <Slider id="outline-thickness" min={1} max={15} step={1} value={[outlineThickness]} onValueChange={(val) => setOutlineThickness(val[0])} aria-label={`Outline thickness: ${outlineThickness} pixels`} />
                      </div>
                      <ColorPickerCustom value={outlineColor} onChange={setOutlineColor} title="Outline Color" />
                    </div>
                  )}
                </div>

                {/* Upgraded: Text Shadow / Glow Settings */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="show-shadow" className="text-sm font-medium">Text Glow / Shadow</Label>
                    <Switch id="show-shadow" name="showShadow" checked={showShadow} onCheckedChange={setShowShadow} aria-label="Toggle text glow or shadow"/>
                  </div>
                  {showShadow && (
                    <div className="space-y-3 pl-3 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="space-y-2">
                        <Label htmlFor="shadow-blur" className="flex justify-between text-xs">
                          <span>Blur Radius:</span> <span>{shadowBlur}px</span>
                        </Label>
                        <Slider id="shadow-blur" min={0} max={25} step={1} value={[shadowBlur]} onValueChange={(val) => setShadowBlur(val[0])} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="shadow-offset-x" className="text-[10px] text-muted-foreground">Offset X</Label>
                          <Slider id="shadow-offset-x" min={-15} max={15} step={1} value={[shadowOffsetX]} onValueChange={(val) => setShadowOffsetX(val[0])} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="shadow-offset-y" className="text-[10px] text-muted-foreground">Offset Y</Label>
                          <Slider id="shadow-offset-y" min={-15} max={15} step={1} value={[shadowOffsetY]} onValueChange={(val) => setShadowOffsetY(val[0])} />
                        </div>
                      </div>
                      <ColorPickerCustom value={shadowColor} onChange={setShadowColor} title="Glow / Shadow Color" />
                    </div>
                  )}
                </div>

                {/* Upgraded: Background Canvas Settings */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="show-background" className="text-sm font-medium">Video Background Canvas</Label>
                    <Switch id="show-background" name="showBackground" checked={showBackground} onCheckedChange={setShowBackground} aria-label="Toggle background canvas"/>
                  </div>
                  {showBackground && (
                    <div className="space-y-3 pl-3 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-150">
                      <ColorPickerCustom value={backgroundColor} onChange={setBackgroundColor} title="Background Color" />
                      <FileUploadInput 
                        id="bg-image-upload" 
                        label="Background Image (.png, .jpg)" 
                        accept="image/*" 
                        icon={<Palette size={18} />} 
                        onFileChange={setBackgroundImageFile} 
                        fileName={backgroundImageFile?.name}
                      />
                    </div>
                  )}
                </div>

                {/* Upgraded: Alternating Multi-line Styles */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="space-y-2">
                    <Label htmlFor="alternate-line-styles">Line Style Alternation</Label>
                    <Select value={alternateLineStyles} onValueChange={setAlternateLineStyles}>
                      <SelectTrigger id="alternate-line-styles" aria-label="Select line coloring option">
                        <SelectValue placeholder="Select coloring style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Single Style Line-by-Line</SelectItem>
                        <SelectItem value="alternate-color">Alternate Odd/Even Colors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {alternateLineStyles === 'alternate-color' && (
                    <div className="pl-3 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-150">
                      <ColorPickerCustom value={alternateColor} onChange={setAlternateColor} title="Odd Line Text Color" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between space-x-2 pt-2 border-t border-border">
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
                
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="text-opacity" className="flex justify-between items-center"><span className="flex items-center gap-2"><Droplets size={16}/> Opacity:</span> <span>{textOpacity}%</span></Label>
                  <Slider id="text-opacity" min={0} max={100} step={1} value={[textOpacity]} onValueChange={(value) => setTextOpacity(value[0])} aria-label={`Text opacity: ${textOpacity} percent`} />
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="text-effect" className="flex items-center gap-2"><Wand2 size={16}/> Text Effect</Label>
                  <Select value={textEffect} onValueChange={setTextEffect}>
                    <SelectTrigger id="text-effect" aria-label="Select text effect">
                      <SelectValue placeholder="Select effect" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="smoke">Smoke</SelectItem>
                      <SelectItem value="typewriter">Typewriter Reveal</SelectItem>
                      <SelectItem value="scalePop">Scale Pop Animation</SelectItem>
                    </SelectContent>
                  </Select>
                  {(textEffect === 'smoke' || textEffect === 'scalePop') && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Note: This effect is only visible in the final rendered video.
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
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

                {/* Custom Color Pickers */}
                <div className="space-y-4 pt-4 border-t border-border">
                  <ColorPickerCustom value={textColor} onChange={setTextColor} title="Base Text Color" />
                </div>
                
                {subtitleEntries.some(e => e.words && e.words.length > 0) && (
                  <div className="space-y-4 pt-2 border-t border-border">
                    <div className="space-y-2">
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

                    <ColorPickerCustom value={highlightColor} onChange={setHighlightColor} title="Highlight Color" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upgraded: Custom Preset Templates Manager */}
            <Card className="shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="bg-card">
                <CardTitle className="flex items-center gap-2 text-xl"><FolderHeart size={24} className="text-primary" /> Style Presets</CardTitle>
                <CardDescription>Save and switch between custom style templates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <Label htmlFor="preset-name">New Template Name</Label>
                  <div className="flex gap-2">
                    <Input id="preset-name" placeholder="e.g. Cyberpunk Blue" className="h-9 text-sm" />
                    <Button 
                      onClick={() => {
                        const inputEl = document.getElementById('preset-name') as HTMLInputElement;
                        if (inputEl && inputEl.value.trim()) {
                          savePreset(inputEl.value.trim());
                          inputEl.value = '';
                        }
                      }}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground h-9 text-xs"
                    >
                      Save
                    </Button>
                  </div>
                </div>

                {customPresets.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider block">Load Preset</Label>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {customPresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-muted/40 border border-border rounded-md text-sm">
                          <span className="font-semibold truncate max-w-[120px]">{preset.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button variant="outline" onClick={() => loadPreset(preset)} className="h-7 px-2.5 text-[10px] font-bold">
                              Load
                            </Button>
                            <Button variant="destructive" onClick={() => deletePreset(preset.name)} className="h-7 px-2.5 text-[10px] font-bold">
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

                    <div className="pt-2">
                      <ColorPickerCustom value={waveformColor} onChange={setWaveformColor} title="Waveform Color" />
                    </div>

                    <div className="space-y-2 pt-2">
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

            {/* Upgraded: Export Settings Card */}
            <Card className="shadow-xl rounded-xl overflow-hidden">
              <CardHeader className="bg-card">
                <CardTitle className="flex items-center gap-2 text-xl"><MonitorPlay size={24} className="text-primary" /> Export Settings</CardTitle>
                <CardDescription>Select video resolution, quality/bitrate, and format.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-3">
                  <Label htmlFor="export-format">Export Format</Label>
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger id="export-format" aria-label="Select export file format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="webm">WebM (.webm — Recommended, Instant Download)</SelectItem>
                      <SelectItem value="mp4">MP4 (.mp4 — Very Slow, In-Browser Transcode)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {exportFormat === 'webm' && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 text-emerald-500 rounded-lg text-[11px] leading-relaxed animate-in fade-in duration-200">
                      <strong>Recommended:</strong> WebM uses browser-native hardware accelerated recording. It completes instantly after recording with zero CPU/wait time. Most modern media players (VLC, browsers, Premiere) support WebM playback.
                    </div>
                  )}
                  {exportFormat === 'mp4' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-[11px] leading-relaxed animate-in fade-in duration-200">
                      <strong>Warning (Very Slow):</strong> MP4 requires software-encoding every frame in a single CPU thread inside the browser sandbox (no GPU acceleration).
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>8-second video: ~2–5 minutes.</li>
                        <li>4-minute video: up to 1–2 hours.</li>
                      </ul>
                      To avoid extremely long wait times, we highly recommend exporting to <strong>WebM</strong> instead.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="export-resolution">Resolution Preset</Label>
                  <Select value={exportResolution} onValueChange={setExportResolution}>
                    <SelectTrigger id="export-resolution" aria-label="Select export resolution">
                      <SelectValue placeholder="Select resolution" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p (HD, 1280x720)</SelectItem>
                      <SelectItem value="1080p">1080p (Full HD, 1920x1080)</SelectItem>
                      <SelectItem value="1440p">1440p (2K HD, 2560x1440)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="export-bitrate">Video Bitrate (Quality)</Label>
                  <Select value={exportBitrate} onValueChange={setExportBitrate}>
                    <SelectTrigger id="export-bitrate" aria-label="Select export quality bitrate">
                      <SelectValue placeholder="Select bitrate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (10 Mbps, small file)</SelectItem>
                      <SelectItem value="medium">Medium (20 Mbps, balanced)</SelectItem>
                      <SelectItem value="high">High (40 Mbps, sharp output)</SelectItem>
                      <SelectItem value="ultra">Ultra (80 Mbps, max quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="export-fps">Frame Rate (FPS)</Label>
                  <Select value={exportFps.toString()} onValueChange={(val) => setExportFps(parseInt(val, 10))}>
                    <SelectTrigger id="export-fps" aria-label="Select export frame rate">
                      <SelectValue placeholder="Select frame rate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 FPS (Cinematic, lower CPU load)</SelectItem>
                      <SelectItem value="30">30 FPS (Standard playback)</SelectItem>
                      <SelectItem value="60">60 FPS (Ultra smooth, higher CPU load)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  {isProcessing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                      <Loader2 size={48} className="text-primary animate-spin mb-4" />
                      <h4 className="text-lg font-bold text-foreground">Processing Video</h4>
                      <p className="text-sm text-muted-foreground max-w-xs mt-1">
                        {processingProgress < 95 || exportFormat !== 'mp4' ? (
                          `Recording canvas frames: ${processingProgress}%...`
                        ) : (
                          <>
                            <span>Converting to MP4: {transcodeProgress}% (Transcoding in browser)...</span>
                            {transcodeEta && (
                              <span className="block text-xs font-semibold text-primary mt-1 animate-pulse">
                                {transcodeEta}
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      <div className="w-48 bg-muted rounded-full h-2 mt-4 overflow-hidden border border-border">
                        <div 
                          className="bg-primary h-full transition-all duration-300 ease-out" 
                          style={{ width: `${(processingProgress < 95 || exportFormat !== 'mp4') ? processingProgress : 95 + (transcodeProgress * 0.05)}%` }}
                        />
                      </div>
                      {processingProgress >= 95 && exportFormat === 'mp4' && (
                        <p className="text-[10px] text-amber-500 mt-2 max-w-xs leading-relaxed">
                          Note: Transcoding MP4 is CPU-intensive. Keep this tab active to prevent browser throttling.
                        </p>
                      )}
                    </div>
                  )}
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
