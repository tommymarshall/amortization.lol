import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';

export default function ShareDialog({ message, url, onClose }: { message: string; url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(message);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const complete = `${draft.trim()}\n\n${url}`;
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(complete);
      setStatus('Message and comparison link copied. Paste them into your conversation.');
    } catch {
      setManualCopy(true);
      setStatus('Select and copy the message below, then paste it into your conversation.');
    }
  }
  useEffect(() => { if (manualCopy) text.current?.select(); }, [manualCopy]);
  async function share() {
    setBusy(true);
    setStatus('');
    try {
      await navigator.share({ title: 'Our mortgage comparison', text: complete });
      // A resolved native share only confirms handoff, not delivery to a recipient.
      setStatus('Comparison handed to your sharing app.');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setStatus('Sharing is unavailable here. Use Copy message below.');
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="share-dialog" aria-labelledby="share-title" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="dialog-content">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close sharing"><X size={20}/></button>
      <h2 id="share-title">Start the conversation.</h2>
      <p className="share-intro">Make it sound like you. Choose your spouse in your sharing app when you’re ready.</p>
      <label className="share-label" htmlFor="share-message">Your message</label>
      <textarea id="share-message" value={draft} onChange={e => { setDraft(e.target.value); setStatus(''); setManualCopy(false); }} rows={12}/>
      <p className="share-link-note">A link to these exact inputs is included. Anyone you send it to can view the comparison.</p>
      <div className="share-actions">
        {typeof navigator.share === 'function' && <button className="primary-button" onClick={share} disabled={busy || !draft.trim()}><Share2 size={16}/>Share message</button>}
        <button className={typeof navigator.share === 'function' ? 'text-button' : 'primary-button'} onClick={copy} disabled={!draft.trim()}>{status.startsWith('Message and') ? <Check size={16}/> : <Copy size={16}/>}Copy message</button>
      </div>
      <p className="share-status" role="status">{status}</p>
      {manualCopy && <><label className="share-label" htmlFor="share-copy">Message and link to copy</label><textarea ref={text} id="share-copy" readOnly value={complete} rows={5}/></>}
    </div>
  </dialog>;
}
