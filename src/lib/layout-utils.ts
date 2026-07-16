import { WordTiming, SubtitleLine } from './subtitle-parser';

export interface TextLayout {
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  baseline: 'top' | 'middle' | 'bottom';
  transform: string;
}

export function getDeterministicRandom(seedStr: string): (offset: number) => number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (offset: number) => {
    const x = Math.sin(hash + offset) * 10000;
    return x - Math.floor(x);
  };
}

export function getDeterministicLayout(
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

export function wrapText(
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

export function wrapWordTimings(
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

/**
 * Binary search for active subtitle entry based on current playback time.
 * O(log N) complexity instead of O(N) linear scan.
 */
export function findActiveSubtitle(entries: SubtitleLine[], time: number): SubtitleLine | undefined {
  if (!entries || entries.length === 0) return undefined;
  
  let low = 0;
  let high = entries.length - 1;
  
  while (low <= high) {
    const mid = (low + high) >> 1;
    const sub = entries[mid];
    
    if (time >= sub.startTime && time <= sub.endTime) {
      return sub;
    } else if (time < sub.startTime) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  
  return undefined;
}
