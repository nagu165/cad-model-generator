import { useState, useEffect } from 'react';
import STLViewer from './components/STLViewer';
import { Sun, Moon } from 'lucide-react';

interface GenerationResult {
  step: string;
  stl: string;
  gcode?: string;
}

type GenerationStatus = 'idle' | 'pending' | 'processing' | 'complete' | 'error';
type GCodeStatus = 'idle' | 'processing' | 'complete' | 'error';

interface GCodeSettings {
  layer_height: number;
  infill_density: number;
  print_speed: number;
  nozzle_temp: number;
  bed_temp: number;
}

function App() {
  const [prompt, setPrompt] = useState<string>(
    'Generate a SpurGear having 20 teeth, a module of 2.0, a width of 12.0, and helix angle of 25.0.'
  );
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState<boolean>(true);
  const [supportedLibraries, setSupportedLibraries] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // G-code feature
  const [showGCodePanel, setShowGCodePanel] = useState<boolean>(false);
  const [gcodeSettings, setGcodeSettings] = useState<GCodeSettings>({
    layer_height: 0.2,
    infill_density: 20,
    print_speed: 60,
    nozzle_temp: 200,
    bed_temp: 60,
  });
  const [gcodeStatus, setGcodeStatus] = useState<GCodeStatus>('idle');
  const [gcodeFile, setGcodeFile] = useState<string | null>(null);

  // Fetch supported libraries
  useEffect(() => {
    const fetchLibraries = async () => {
      try {
        const res = await fetch('/api/libraries');
        const data = await res.json();
        if (data.libraries) {
          const names = data.libraries.map((l: any) => l.name);
          setSupportedLibraries(names);
        }
      } catch (err) {
        console.error('Failed to fetch libraries:', err);
      }
    };
    fetchLibraries();
  }, []);

  // Poll backend for generation status
  useEffect(() => {
    if (status !== 'pending' && status !== 'processing') return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/generation-status');
        const data = await res.json();

        if (data.status === 'complete') {
          setStatus('complete');
          setResult({
            stl: data.stl_filename
              ? `/output.stl?filename=${encodeURIComponent(data.stl_filename)}`
              : '',
            step: data.step_filename
              ? `/output.step?filename=${encodeURIComponent(data.step_filename)}`
              : '',
          });
          clearInterval(intervalId);
        } else if (data.status === 'error') {
          setStatus('error');
          setError(data.error_message || 'An unknown error occurred.');
          clearInterval(intervalId);
        } else {
          setStatus(data.status);
        }
      } catch {
        setStatus('error');
        setError('Failed to get generation status.');
        clearInterval(intervalId);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStatus('pending');
    setError(null);
    setResult(null);
    setGcodeFile(null);
    setGcodeStatus('idle');
    setShowGCodePanel(false);

    setPromptHistory((prev) => [...prev, prompt]);
    setPrompt('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to start generation.');
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleGenerateGCode = async () => {
    if (!result?.stl) return;
    setGcodeStatus('processing');
    setError(null);
    const filename = new URL(result.stl, window.location.origin).searchParams.get('filename');

    try {
      const response = await fetch('/api/generate-gcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, ...gcodeSettings }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to generate G-code.');
      }

      const data = await response.json();
      setGcodeStatus('complete');
      setGcodeFile(`/api/download-gcode/${data.filename}`);
    } catch (err: any) {
      console.error('G-code generation failed:', err);
      setGcodeStatus('error');
      setError(err.message);
    }
  };

  const isLoading = status === 'pending' || status === 'processing';

  return (
    <div className={`${isDarkMode ? 'bg-[#0d1117] text-gray-200' : 'bg-gray-50 text-gray-800'} min-h-screen transition-all duration-300 flex flex-col`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-8 py-5 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-300'} shadow-md`}>
        <div className="w-8" />
        <h1 className="text-3xl font-semibold tracking-tight text-center flex-1">Text-to-CAD Generator</h1>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 rounded-lg hover:bg-gray-700 transition"
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun className="text-yellow-400" /> : <Moon className="text-gray-800" />}
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto w-full p-8">
        {/* LEFT PANEL */}
        <div className={`flex flex-col justify-between p-6 rounded-2xl shadow-lg border ${isDarkMode ? 'bg-[#1a1f29] border-gray-800' : 'bg-white border-gray-200'}`}>
          {/* Prompt History */}
          <div className="overflow-y-auto flex-1 space-y-3 pr-1 pb-4">
            {promptHistory.length === 0 ? (
              <p className="text-gray-500 text-center mt-8">Your prompt history will appear here.</p>
            ) : (
              promptHistory.map((p, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? 'bg-[#2a2f3a]' : 'bg-gray-100'}`}
                >
                  <span className="flex-grow mr-3 break-all">{p}</span>
                  <button
                    onClick={() => handleCopy(p, idx)}
                    className={`text-sm font-semibold ${copiedIndex === idx ? 'text-green-400' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {copiedIndex === idx ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="mt-4 border-t pt-4 space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your 3D model (e.g., a gear with 20 teeth...)"
              rows={4}
              disabled={isLoading}
              className={`w-full p-3 rounded-xl border shadow-sm focus:ring-2 focus:ring-green-500 focus:outline-none disabled:opacity-60 ${
                isDarkMode
                  ? 'bg-[#0d1117] border-gray-700 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-800'
              }`}
            />
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 transition"
            >
              {isLoading ? `Processing... (${status})` : 'Generate CAD'}
            </button>
          </form>

          {/* G-code Settings (Moved to Left Panel) */}
          {status === 'complete' && result && (
            <div className="mt-6 border-t pt-4">
              {!showGCodePanel ? (
                <button
                  onClick={() => setShowGCodePanel(true)}
                  className="w-full bg-[#34384a] hover:bg-[#454a5a] text-gray-200 py-2 rounded transition flex items-center justify-center gap-2"
                >
                  ⚙️ Configure G-code
                </button>
              ) : (
                <div className="p-4 rounded-lg border border-gray-600 bg-[#0d1117]">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-semibold text-green-400">
                      Print Settings
                    </h4>
                    <button
                      onClick={() => setShowGCodePanel(false)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                    {Object.entries(gcodeSettings).map(([key, val]) => (
                      <label key={key} className="flex flex-col gap-1">
                        <span className="text-gray-400 capitalize">{key.replace('_', ' ')}</span>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) =>
                            setGcodeSettings({
                              ...gcodeSettings,
                              [key]: parseFloat(e.target.value),
                            })
                          }
                          className="p-1.5 rounded bg-[#1a1f29] border border-gray-700 text-gray-200 focus:border-green-500 focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleGenerateGCode}
                      disabled={gcodeStatus === 'processing'}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-medium transition disabled:opacity-50"
                    >
                      {gcodeStatus === 'processing' ? 'Generating...' : 'Generate G-code'}
                    </button>
                    
                    {gcodeStatus === 'complete' && gcodeFile && (
                      <a
                        href={gcodeFile}
                        download
                        className="block w-full text-center bg-[#1a1f29] border border-green-500/30 text-green-400 py-2 rounded hover:bg-[#2a2f3a] transition"
                      >
                        Download .gcode
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className={`flex flex-col justify-center items-center rounded-2xl p-6 shadow-lg border ${isDarkMode ? 'bg-[#1a1f29] border-gray-800' : 'bg-white border-gray-200'}`}>
          {status === 'complete' && result && showViewer ? (
            <div className="w-full flex flex-col items-center">
              <h3 className="text-lg font-semibold mb-3 text-center text-green-400">3D Preview</h3>
              <div className="bg-[#2a2f3a] rounded-lg overflow-hidden border border-gray-700 w-full h-[450px]">
                <STLViewer url={result.stl} />
              </div>
              <p className="text-sm text-gray-400 text-center mt-3">
                Click and drag to rotate • Mouse wheel to zoom
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center text-gray-400 animate-pulse">
              <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              Generating your 3D model...
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-lg font-medium">Ready to Generate ✨</p>
              <p className="text-xs mt-1">
                Enter a description and click "Generate CAD"
              </p>
            </div>
          )}

          {/* Download Buttons */}
          {status === 'complete' && result && (
            <div className="w-full mt-6 space-y-4">
              <div className="flex gap-4">
                <a href={result.step} download className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white py-2 rounded transition">⬇ STEP</a>
                <a href={result.stl} download className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white py-2 rounded transition">⬇ STL</a>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
