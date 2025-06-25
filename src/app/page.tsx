"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, Download, Settings2, Film, Type, ListFilter, AlertCircle, Loader2, Wand2, Droplets } from 'lucide-react';
import { FileUploadInput } from '@/components/custom/file-upload-input';

const PREVIEW_TEXT = "Aa Bb Gg Yy 0123 Zz. Quick brown fox.";
const FONT_STYLE_TAG_ID = "custom-font-preview-style";
const TARGET_VIDEO_WIDTH = 1920;
const TARGET_VIDEO_HEIGHT = 1080;
const TARGET_BITRATE = 20000000;

interface SrtEntry {
  startTime: number;
  endTime: number;
  text: string;
}

interface Particle {
  x: number; y: number;
  size: number;
  opacity: number;
  vx: number; vy: number;
}


function parseSRT(srtContent: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const lines = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

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
      entries.push({ startTime, endTime, text: textLines });
    } catch (e) {
      console.error("Error parsing time in SRT block:", timeString, e);
      // Skip this entry if time parsing fails
    }
  }
  return entries;
}


export default function SubtitleWeaverPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtEntries, setSrtEntries] = useState<SrtEntry[]>([]);

  const [fontSize, setFontSize] = useState<number>(72);
  const [positionX, setPositionX] = useState<number>(50);
  const [positionY, setPositionY] = useState<number>(90);
  const [showOutline, setShowOutline] = useState<boolean>(true);
  const [textCase, setTextCase] = useState<string>('normal');
  const [textOpacity, setTextOpacity] = useState<number>(100);
  const [textEffect, setTextEffect] = useState<string>('none');

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


  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoPreviewUrl(url);
      setProcessedVideoUrl(null); // Clear previous processed video
      setProcessedVideoFilename(null);
      return () => {
        if (url) URL.revokeObjectURL(url);
      };
    } else {
      setVideoPreviewUrl(null);
    }
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
    if (srtFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const content = reader.result as string;
        try {
          const parsed = parseSRT(content);
          setSrtEntries(parsed);
          if (parsed.length === 0 && content.trim() !== "") {
             toast({ title: "SRT Parsing Issue", description: "SRT file might be empty or improperly formatted. No subtitles parsed.", variant: "destructive"});
          }
        } catch (e) {
          console.error("Failed to parse SRT:", e);
          toast({ title: "SRT Parsing Error", description: "Could not parse the SRT file. Please check its format.", variant: "destructive"});
          setSrtEntries([]);
        }
      };
      reader.onerror = () => {
         toast({ title: "SRT Read Error", description: "Could not read the SRT file.", variant: "destructive"});
         setSrtEntries([]);
      }
      reader.readAsText(srtFile);
    } else {
      setSrtEntries([]);
    }
  }, [srtFile, toast]);


  const handleBurnVideoClientSide = async () => {
    if (!videoFile || !srtFile) {
      toast({ title: "Missing Files", description: "Please upload video and SRT files.", variant: "destructive" });
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
    lastSubRef.current = null;
    particlesRef.current = [];

    const videoElement = document.createElement('video');
    const videoBlobUrl = URL.createObjectURL(videoFile);
    videoElement.src = videoBlobUrl;
    videoElement.muted = true; // Important for autoplay and background processing

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

    const mediaChunks: BlobPart[] = [];
    let recorder: MediaRecorder;

    try {
      const stream = canvas.captureStream(30);
      recorder = new MediaRecorder(stream, {
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
        toast({ title: "Processing Complete!", description: "Your video is ready for download." });
        URL.revokeObjectURL(videoBlobUrl);
      };
      
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        const error = "Unknown MediaRecorder error";
        setProcessingError(`MediaRecorder error: ${error}`);
        toast({ title: "Recording Error", description: `An error occurred during video recording: ${error}`, variant: "destructive" });
        setIsProcessing(false);
        if (recorder.state !== "inactive") recorder.stop();
      };

    } catch (e: any) {
        console.error("Error setting up MediaRecorder:", e);
        setProcessingError(`Setup error: ${e.message}`);
        toast({ title: "Setup Error", description: `Could not initialize video recorder: ${e.message}`, variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    

    videoElement.onloadedmetadata = async () => {
        recorder.start();
        videoElement.play();

        function renderFrame() {
          if (videoElement.paused || videoElement.ended || recorder.state === "inactive") {
            if (recorder.state === "recording") recorder.stop();
            return;
          }
          
          const currentTime = videoElement.currentTime;

          const activeSub = srtEntries.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
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

          // Render subtitles
          if (activeSub) {
            if (ctx) {
              ctx.globalAlpha = textOpacity / 100;
              ctx.font = `${fontSize}px ${loadedFontName || "'Inter', sans-serif"}`;
              ctx.textAlign = 'center';
              ctx.fillStyle = 'white';
              
              let subText = activeSub.text;
              if (textCase === 'uppercase') subText = subText.toUpperCase();
              else if (textCase === 'lowercase') subText = subText.toLowerCase();

              const textX = canvas.width * (positionX / 100);
              const textY = canvas.height * (positionY / 100);
              
              if (showOutline) {
                ctx.strokeStyle = 'black';
                ctx.lineWidth = Math.max(1, fontSize / 15); // Dynamic outline width
                ctx.strokeText(subText, textX, textY);
              }
              ctx.fillText(subText, textX, textY);
              
              // Smoke Effect particle generation
              if (textEffect === 'smoke') {
                const textMetrics = ctx.measureText(subText);
                const textWidth = textMetrics.width;
                // Spawn a few new particles around the text
                for (let i = 0; i < 3; i++) {
                  particlesRef.current.push({
                      x: textX - textWidth / 2 + Math.random() * textWidth, // Spawn along the text width
                      y: textY - (fontSize * 0.25) + (Math.random() - 0.5) * (fontSize * 0.5), // Around the vertical middle of text
                      size: Math.random() * (fontSize / 15) + 2,
                      opacity: Math.random() * 0.4 + 0.1,
                      vx: (Math.random() - 0.5) * 0.5,
                      vy: -Math.random() * 0.8 - 0.2,
                  });
                }
              }

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
    };
  };
  
  const canSubmit = !!videoFile && !!srtFile && !isProcessing;

  const subtitlePreviewStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${positionX}%`,
    top: `${positionY}%`,
    opacity: textOpacity / 100,
    transform: 'translateX(-50%)',
    fontSize: `${fontSize / (TARGET_VIDEO_HEIGHT / (videoRef.current?.clientHeight || TARGET_VIDEO_HEIGHT))}px`, // Scale font size for preview
    fontFamily: previewFontFamily,
    color: 'white',
    textShadow: showOutline ? `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 0px ${fontSize/20}px #000` : 'none',
    textAlign: 'center',
    width: 'auto',
    maxWidth: '90%',
    pointerEvents: 'none',
    lineHeight: '1.2',
    whiteSpace: 'pre-wrap',
    zIndex: 10,
    textTransform: textCase === 'uppercase' ? 'uppercase' : textCase === 'lowercase' ? 'lowercase' : 'none',
  };

  let displayedPreviewText = PREVIEW_TEXT;
  if (srtEntries.length > 0) {
    displayedPreviewText = srtEntries[0].text; // Show first SRT line as preview
  }
  if (textCase === 'uppercase') {
    displayedPreviewText = displayedPreviewText.toUpperCase();
  } else if (textCase === 'lowercase') {
    displayedPreviewText = displayedPreviewText.toLowerCase();
  }


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
                <FileUploadInput id="srt-upload" label="SRT Subtitle File (.srt)" accept=".srt" icon={<ListFilter size={18} />} onFileChange={setSrtFile} fileName={srtFile?.name}/>
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
                <div className="flex items-center justify-between space-x-2 pt-2">
                  <Label htmlFor="show-outline" className="text-sm">Show Subtitle Outline</Label>
                  <Switch id="show-outline" name="showOutline" checked={showOutline} onCheckedChange={setShowOutline} aria-label="Toggle subtitle outline"/>
                </div>
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
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-xl rounded-xl overflow-hidden h-full flex flex-col">
              <CardHeader className="bg-card">
                <CardTitle className="text-xl">Video Preview & Output</CardTitle>
                 <CardDescription>See your uploaded video. Processed video will be available for download.</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex flex-col items-center justify-center space-y-4 p-6">
                <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden border border-border shadow-inner relative">
                  {videoPreviewUrl ? (
                    <>
                      <video ref={videoRef} src={videoPreviewUrl} controls className="w-full h-full object-contain" aria-label="Uploaded video preview"></video>
                      <div style={subtitlePreviewStyle} aria-hidden="true">
                        {displayedPreviewText}
                      </div>
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
                   <Button
                    onClick={handleBurnVideoClientSide}
                    disabled={!canSubmit}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 text-base rounded-lg"
                  >
                    {isProcessing ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Weaving Subtitles...
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
