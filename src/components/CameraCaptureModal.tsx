import { useState, useEffect, useRef } from 'react';

interface CameraCaptureModalProps {
  onCapture: (dataUrl: string, ts: string, lat: number, lng: number) => void;
  onClose: () => void;
  title: string;
}

export default function CameraCaptureModal({ onCapture, onClose, title }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isMounted = true;

    // Start camera
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (!isMounted) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        currentStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(err => setError("Camera access denied or unavailable: " + err.message));

    // Get location
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (isMounted) setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      err => {
        if (isMounted) setError("Location access denied or unavailable: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => {
      isMounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!location) {
      setError("Waiting for GPS location...");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw Stamp Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, canvas.height - 70, canvas.width, 70);

    // Draw Stamp Text
    const tsIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    ctx.fillStyle = 'white';
    ctx.font = '16px monospace';
    ctx.fillText(`${title}`, 15, canvas.height - 45);
    ctx.fillText(`IST: ${tsIST}`, 15, canvas.height - 25);
    ctx.direction = "rtl";
    ctx.fillText(`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} :GPS`, canvas.width - 15, canvas.height - 25);
    ctx.direction = "ltr";

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(dataUrl, new Date().toISOString(), location.lat, location.lng);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 flex justify-between items-center bg-slate-800 text-white">
          <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        
        <div className="relative bg-black flex-1 flex flex-col justify-center items-center py-4 min-h-[300px]">
          {error ? (
            <div className="text-red-400 p-4 text-center text-sm">{error}</div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full max-h-[60vh] object-contain"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {!location && (
                <div className="absolute top-4 right-4 bg-yellow-500/90 text-black px-3 py-1 rounded-full text-xs font-bold animate-pulse shadow-lg">
                  Acquiring GPS...
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 bg-slate-800 flex justify-center">
          <button 
            onClick={takePhoto}
            disabled={!location || !!error}
            className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${(!location || !!error) ? 'border-slate-600 bg-slate-700' : 'border-white bg-emerald-500 hover:bg-emerald-400 hover:scale-105 active:scale-95'}`}
          >
            <div className={`w-12 h-12 rounded-full ${(!location || !!error) ? 'bg-slate-600' : 'bg-white'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
