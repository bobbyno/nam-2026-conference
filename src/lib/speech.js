/** Browser speech, kept apart from the picker so a test can fake it. */

export const recognitionCtor = () =>
  typeof window === 'undefined' ? null : window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

let active = null;

/** Silence the microphone and the voice, e.g. when the attendee stops the conversation. */
export function cancelSpeech() {
  try { active?.abort(); } catch { /* already stopped */ }
  active = null;
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel?.();
}

/** One utterance as text. Rejects on a recognition error or when nothing was heard. */
export function listen() {
  return new Promise((resolve, reject) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return reject(new Error('Speech recognition is not available'));
    const rec = new Ctor();
    let text = '';
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { text = e.results?.[0]?.[0]?.transcript ?? text; };
    rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Microphone access was blocked' : 'Could not hear you'));
    rec.onend = () => (text.trim() ? resolve(text.trim()) : reject(new Error('Could not hear you')));
    active = rec;
    rec.start();
  });
}

/** Read `text` aloud; resolves when finished, or at once when synthesis is absent. */
export function speak(text) {
  return new Promise((resolve) => {
    const synth = typeof window === 'undefined' ? null : window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return resolve();
    const u = new window.SpeechSynthesisUtterance(text);
    u.onend = resolve;
    u.onerror = resolve;
    synth.speak(u);
  });
}
