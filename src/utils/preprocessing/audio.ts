import audioBufferToWav from 'audiobuffer-to-wav'

/**
 * Converts a WebM audio blob to WAV format
 * @param webmBlob - The WebM audio blob to convert
 * @returns A promise that resolves to a WAV audio blob
 */
export async function convertWebMToWAV(webmBlob: Blob): Promise<Blob> {
  const arrayBuffer = await webmBlob.arrayBuffer()
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Convert to WAV
  const wavArrayBuffer = audioBufferToWav(audioBuffer)
  const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' })

  return wavBlob
}

/**
 * Validates if WebM audio recording is supported in the current browser
 * @returns true if supported, false otherwise
 */
export function isWebMAudioSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm')
  )
}
