export interface WordTiming {
  id: number;
  text: string;
  timestamp: number;
  duration: number;
}

export interface SubtitleLine {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  words?: WordTiming[];
}

export function parseSRT(srtContent: string): SubtitleLine[] {
  const entries: SubtitleLine[] = [];
  const lines = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  let idCounter = 0;
  for (const block of lines) {
    if (!block.trim()) continue;
    const blockLines = block.split('\n');
    if (blockLines.length < 2) continue; // Skip blocks without enough lines (number, time, text)

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
    }
  }
  return entries;
}

export function parseJSONLyrics(jsonContent: string): SubtitleLine[] {
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
