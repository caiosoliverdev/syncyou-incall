import { execFileSync, spawnSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { v7 as uuidv7 } from 'uuid';

export const CHAT_VIDEO_MIN_TRIM_SEC = 0.5;
const FULL_RANGE_EPS_SEC = 0.2;

function ffprobeBin(): string {
  return ffprobe.path;
}

function ffmpegBin(): string {
  if (!ffmpegPath) {
    throw new Error('FFMPEG_BIN_UNAVAILABLE');
  }
  return ffmpegPath;
}

export function probeVideoDurationSec(filePath: string): number {
  const out = execFileSync(
    ffprobeBin(),
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    { encoding: 'utf-8' },
  );
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error('DURATION_PROBE_FAILED');
  }
  return d;
}

function hasAudioStream(filePath: string): boolean {
  try {
    const out = execFileSync(
      ffprobeBin(),
      [
        '-v',
        'error',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        filePath,
      ],
      { encoding: 'utf-8' },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Corta o vídeo para MP4 H.264/AAC (trecho [startSec, endSec)).
 */
export function trimVideoFileToMp4(
  tempInputPath: string,
  startSec: number,
  endSec: number,
): { buffer: Buffer; size: number } {
  const outPath = join(tmpdir(), `incall-chat-trim-${uuidv7()}.mp4`);
  const duration = endSec - startSec;
  const hasAudio = hasAudioStream(tempInputPath);

  const args: string[] = [
    '-y',
    '-ss',
    String(startSec),
    '-i',
    tempInputPath,
    '-t',
    String(duration),
    '-map',
    '0:v:0',
  ];
  if (hasAudio) {
    args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k');
  } else {
    args.push('-an');
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-movflags',
    '+faststart',
    outPath,
  );

  const r = spawnSync(ffmpegBin(), args, { encoding: 'utf-8' });
  if (r.status !== 0) {
    try {
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
    throw new Error(
      r.stderr?.toString() || r.stdout?.toString() || 'FFMPEG_TRIM_FAILED',
    );
  }

  const buffer = readFileSync(outPath);
  try {
    unlinkSync(outPath);
  } catch {
    /* ignore */
  }

  return { buffer, size: buffer.length };
}

export function isFullRangeTrim(
  startSec: number,
  endSec: number,
  durationSec: number,
): boolean {
  return (
    startSec <= FULL_RANGE_EPS_SEC &&
    endSec >= durationSec - FULL_RANGE_EPS_SEC &&
    endSec - startSec >= CHAT_VIDEO_MIN_TRIM_SEC
  );
}

export function clampTrimRange(
  startSec: number,
  endSec: number,
  durationSec: number,
): { start: number; end: number } {
  const d = durationSec;
  let start = Math.max(0, Math.min(startSec, d - CHAT_VIDEO_MIN_TRIM_SEC));
  let end = Math.max(start + CHAT_VIDEO_MIN_TRIM_SEC, Math.min(endSec, d));
  if (end - start < CHAT_VIDEO_MIN_TRIM_SEC) {
    end = Math.min(d, start + CHAT_VIDEO_MIN_TRIM_SEC);
  }
  return { start, end };
}

/**
 * Um frame JPEG (~metade da duração), largura máx. 480px para poupar espaço.
 */
export function extractMiddleFrameJpeg(videoPath: string, outputJpegPath: string): void {
  const duration = probeVideoDurationSec(videoPath);
  const t = Math.max(0, duration / 2);
  const r = spawnSync(
    ffmpegBin(),
    [
      '-y',
      '-i',
      videoPath,
      '-ss',
      String(t),
      '-vframes',
      '1',
      '-q:v',
      '5',
      '-vf',
      'scale=480:-2',
      outputJpegPath,
    ],
    { encoding: 'utf-8' },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.toString() || r.stdout?.toString() || 'POSTER_EXTRACT_FAILED');
  }
}
