import { env } from 'onnxruntime-web/wasm';
import wasmUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';

// Some supported browsers do not yet provide the method used by the JSR base64 decoder.
if (!ArrayBuffer.prototype.transfer) {
  Object.defineProperty(ArrayBuffer.prototype, 'transfer', { configurable: true, writable: true, value(length = this.byteLength) {
    const out = new ArrayBuffer(length);
    new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
    return out;
  }});
}
env.wasm.numThreads = 1;
env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
const acute = '\u0301';
export async function autoAccent(original) {
  const {markStresses} = await import('@roj/rustress');
  const plain = original.replaceAll(acute, '');
  const predicted = await markStresses(plain, { marker: acute, markYo: true });
  if (predicted.replaceAll(acute, '') !== plain) throw new Error('Модель изменила исходный текст');
  // Preserve manually entered accents. The model occasionally places a mark on
  // a consonant (e.g. 'ест́ь'); never pass that invalid mark into the editor.
  const words = /[а-яё\u0301]+/gi;
  const originalWords = original.match(words) || [];
  let index = 0;
  return predicted.replace(words, word => {
    const before = originalWords[index++];
    if (before?.includes(acute)) return before;
    const plainWord = word.replaceAll(acute, '');
    const vowels = [...plainWord.matchAll(/[аеёиоуыэюя]/gi)];
    // With exactly one vowel, any model accent has only one valid position.
    if (word.includes(acute) && vowels.length === 1) {
      const index = vowels[0].index + 1;
      return plainWord.slice(0, index) + acute + plainWord.slice(index);
    }
    // For a multi-vowel word, discard invalid accents rather than guess.
    return word.replace(/([^аеёиоуыэюя])́/gi, '$1');
  });
}
