
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Trophy, 
  Activity, 
  RotateCcw, 
  BookOpen, 
  ChevronRight,
  Brain,
  ImageOff,
  Maximize2,
  Minimize2,
  Timer,
  Flag
} from 'lucide-react';
import { ASANA_DATA, REGION_OVERRIDES, TERM_DEFINITIONS } from './data';
import { Asana, QuizOption, Region, WrongAnswer } from './types';

// Utility: Shuffle Array
const shuffle = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// Utility: Extract Sanskrit/English names
const formatName = (name: string) => {
  const match = name.match(/^(.*?)\s*\(([^)]+)\)/);
  if (match) {
    return { sanskrit: match[1].trim(), english: match[2].trim() };
  }
  return { sanskrit: name, english: '' };
};

// Utility: Format Seconds to MM:SS
const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// --- Sub-component for Robust Image Loading ---
const AsanaImage: React.FC<{ asanaId: string; alt: string }> = ({ asanaId, alt }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Generate all possible paths to try
  const candidates = useMemo(() => {
    const paths = [];
    // Standard extensions
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];
    // Try standard relative path first, then absolute, then dot-relative
    const prefixes = ['images/', '/images/', './images/'];

    // Cache buster to prevent "Image not found" caching during development
    const cacheBuster = `?t=${new Date().getTime()}`; 

    for (const prefix of prefixes) {
        for (const ext of extensions) {
            paths.push(`${prefix}${asanaId}.${ext}${cacheBuster}`);
        }
    }
    return paths;
  }, [asanaId]);

  // Reset when asana changes
  useEffect(() => {
    setError(false);
    setAttempt(0);
    setSrc(candidates[0]);
  }, [asanaId, candidates]);

  const handleError = () => {
    const nextAttempt = attempt + 1;
    if (nextAttempt < candidates.length) {
      setAttempt(nextAttempt);
      setSrc(candidates[nextAttempt]);
    } else {
      console.warn(`Failed to load image for ${asanaId}. Tried ${candidates.length} variations. Last tried: ${src}`);
      setError(true);
    }
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 p-4 text-center bg-slate-100 border-2 border-dashed border-slate-200 m-2 rounded-xl">
        <ImageOff className="w-6 h-6 mb-2 opacity-50" />
        <span className="text-[10px] font-mono leading-tight text-slate-400">
           Image not found.<br/>
           Expected: <strong>images/{asanaId}.jpg</strong>
        </span>
      </div>
    );
  }

  return (
    <img 
      src={src || ""} 
      alt={alt}
      className="absolute inset-0 w-full h-full object-contain p-2 md:p-6 mix-blend-multiply transition-opacity duration-300"
      onError={handleError}
    />
  );
};

const App: React.FC = () => {
  // --- State ---
  const [mode, setMode] = useState<'practice' | 'review' | 'summary'>('practice');
  const [region, setRegion] = useState<Region>('upper-body');
  
  // Queue management
  const [queue, setQueue] = useState<string[]>([]);
  const [currentAsanaId, setCurrentAsanaId] = useState<string | null>(null);
  
  // Game stats
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Current Question State
  const [shuffledOptions, setShuffledOptions] = useState<QuizOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  // Review Data
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  // Stats for summary
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});

  // UI State
  const [mobileImageExpanded, setMobileImageExpanded] = useState(false);

  // Helper to get options based on current region
  const getOptionsForAsana = useCallback((asana: Asana, targetRegion: Region) => {
    const overrides = REGION_OVERRIDES[asana.id];
    if (targetRegion === 'trunk' && overrides?.trunk) return overrides.trunk;
    if (targetRegion === 'lower-body' && overrides?.lower) return overrides.lower;
    return asana.quizOptions;
  }, []);

  // --- Actions ---

  const startSession = useCallback(() => {
    const newQueue = shuffle(ASANA_DATA.map(a => a.id));
    setQueue(newQueue);
    setCurrentAsanaId(newQueue[0]);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTotalAnswered(0);
    setElapsedTime(0);
    setWrongAnswers([]);
    setSeenCounts({});
    setMode('practice');
    setIsAnswered(false);
    setSelectedOptionId(null);
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: number | undefined;
    if (mode === 'practice') {
      interval = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [mode]);

  // Initialize on mount
  useEffect(() => {
    startSession();
  }, [startSession]);

  // Load question options when asana changes
  useEffect(() => {
    if (!currentAsanaId) return;
    const asana = ASANA_DATA.find(a => a.id === currentAsanaId);
    if (asana) {
      // If in review mode, we need to show the options for the stored wrong answer's category
      // If in practice mode, use current selected region
      let activeRegion = region;
      
      if (mode === 'review' && wrongAnswers[reviewIndex]) {
        activeRegion = wrongAnswers[reviewIndex].category;
      }

      const opts = getOptionsForAsana(asana, activeRegion);
      setShuffledOptions(shuffle(opts));
      setIsAnswered(false);
      setSelectedOptionId(null);
      setMobileImageExpanded(false); // Reset image expansion
      
      // Track seen count
      setSeenCounts(prev => ({
        ...prev,
        [asana.id]: (prev[asana.id] || 0) + 1
      }));
    }
  }, [currentAsanaId, region, mode, reviewIndex, wrongAnswers, getOptionsForAsana]);


  const handleAnswer = (optionId: string) => {
    if (isAnswered) return;

    const asana = ASANA_DATA.find(a => a.id === currentAsanaId);
    if (!asana) return;

    // Determine correct option based on current context
    let activeRegion = region;
    if (mode === 'review' && wrongAnswers[reviewIndex]) {
      activeRegion = wrongAnswers[reviewIndex].category;
    }
    
    const options = getOptionsForAsana(asana, activeRegion);
    const correctOption = options.find(o => o.correct);
    
    if (!correctOption) return;

    const correct = optionId === correctOption.id;
    
    setIsAnswered(true);
    setSelectedOptionId(optionId);
    setIsCorrect(correct);
    setTotalAnswered(prev => prev + 1);

    if (mode === 'practice') {
      if (correct) {
        setScore(prev => prev + 10);
        setStreak(prev => prev + 1);
        setBestStreak(prev => Math.max(prev, streak + 1));
        
        // Auto advance after short delay
        setTimeout(() => {
          nextQuestion();
        }, 1500);
      } else {
        setStreak(0);
        setWrongAnswers(prev => [...prev, {
          asanaId: asana.id,
          chosenId: optionId,
          correctOption: correctOption,
          category: region
        }]);
      }
    }
  };

  const nextQuestion = () => {
    if (mode === 'review') {
      if (reviewIndex < wrongAnswers.length - 1) {
        setReviewIndex(prev => prev + 1);
        const nextWrong = wrongAnswers[reviewIndex + 1];
        setCurrentAsanaId(nextWrong.asanaId);
      } else {
        setMode('summary');
      }
      return;
    }

    // Practice Mode Logic
    const remaining = queue.filter(id => id !== currentAsanaId);
    
    if (remaining.length === 0 || totalAnswered >= 35) { // Cap at 36 total
      setMode('summary');
    } else {
      setQueue(remaining);
      setCurrentAsanaId(remaining[0]);
    }
  };

  const finishSessionEarly = () => {
    if (window.confirm("Are you sure you want to end the session early?")) {
      setMode('summary');
    }
  };

  const startReview = () => {
    if (wrongAnswers.length === 0) return;
    setMode('review');
    setReviewIndex(0);
    setCurrentAsanaId(wrongAnswers[0].asanaId);
  };

  const changeRegion = (newRegion: Region) => {
    if (isAnswered && mode === 'practice') {
      setRegion(newRegion);
      setIsAnswered(false);
      setSelectedOptionId(null);
    } else {
      setRegion(newRegion);
    }
  };

  // --- Render Helpers ---

  const currentAsana = ASANA_DATA.find(a => a.id === currentAsanaId);
  const names = currentAsana ? formatName(currentAsana.name) : { sanskrit: '', english: '' };

  const getExplanationTerms = (text: string) => {
    const found: string[] = [];
    const lower = text.toLowerCase();
    Object.keys(TERM_DEFINITIONS).forEach(term => {
      if (lower.includes(term.toLowerCase())) {
        found.push(term);
      }
    });
    return found.sort((a, b) => b.length - a.length).slice(0, 5); 
  };

  const correctText = shuffledOptions.find(o => o.correct)?.text || "";

  if (mode === 'summary') {
    return (
      <div className="h-[100dvh] bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-teal-600 p-8 text-center text-white">
            <Trophy className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Session Complete!</h1>
            <p className="text-teal-100">Here is how you performed</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                <span className="block text-sm text-slate-500 uppercase font-bold tracking-wider">Final Score</span>
                <span className="text-3xl font-black text-slate-800">{score}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                <span className="block text-sm text-slate-500 uppercase font-bold tracking-wider">Best Streak</span>
                <span className="text-3xl font-black text-slate-800">{bestStreak}</span>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100 flex justify-between items-center px-8">
              <span className="text-sm text-slate-500 uppercase font-bold tracking-wider">Total Time</span>
              <span className="text-xl font-black text-slate-800 font-mono">{formatTime(elapsedTime)}</span>
            </div>

            <div className="space-y-3">
              <button 
                onClick={startSession}
                className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" /> Start New Session
              </button>
              
              {wrongAnswers.length > 0 && (
                <button 
                  onClick={startReview}
                  className="w-full py-4 bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold rounded-xl transition flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-5 h-5" /> Review {wrongAnswers.length} Mistakes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 text-slate-800 font-sans">
      {/* Compact Header */}
      <header className="bg-slate-900 text-white px-3 py-2 md:p-3 shadow-md shrink-0 z-20 h-12 md:h-16 flex items-center">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="text-teal-400 w-5 h-5 md:w-6 md:h-6" />
            <span className="font-bold text-base md:text-lg tracking-tight hidden xs:inline">Anatomator</span>
          </div>
          
          <div className="flex gap-4 md:gap-8 items-center text-xs sm:text-sm">
             
             {/* Timer Display */}
             {mode === 'practice' && (
               <div className="flex gap-1.5 items-center bg-slate-800 px-2 py-1 rounded">
                  <Timer className="w-3.5 h-3.5 text-teal-400" />
                  <span className="font-mono text-sm md:text-base leading-none text-teal-50">{formatTime(elapsedTime)}</span>
               </div>
             )}

             <div className="flex gap-1.5 items-center hidden sm:flex">
                <span className="text-slate-400 uppercase text-[10px] font-bold">Score</span>
                <span className="font-mono text-base md:text-lg leading-none">{score}</span>
             </div>
             <div className="flex gap-1.5 items-center">
                <span className="text-slate-400 uppercase text-[10px] font-bold hidden sm:inline">Streak</span>
                <div className={`font-mono text-base md:text-lg leading-none flex items-center gap-1 ${streak > 2 ? 'text-orange-400' : ''}`}>
                   {streak > 0 && <Activity className="w-3 h-3" />} {streak}
                </div>
             </div>
             
             {/* Finish Button */}
             {mode === 'practice' && (
                <button 
                  onClick={finishSessionEarly}
                  className="bg-slate-700 hover:bg-slate-600 text-white p-1.5 rounded-full transition ml-1"
                  title="Finish Session Early"
                >
                   <Flag className="w-4 h-4" />
                </button>
             )}
          </div>
        </div>
      </header>

      {/* Main Content - Strict flex layout to prevent body scroll */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {currentAsana && (
          <div className="h-full flex flex-col md:flex-row overflow-hidden">
            
            {/* Left Panel: Image & Context */}
            {/* COMPACT MODE: Fixed small height on mobile (h-32 = 128px) to reduce scrolling */}
            <div className={`bg-white md:w-1/2 lg:w-5/12 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out ${mobileImageExpanded ? 'h-3/4 absolute inset-x-0 top-0 z-30 shadow-2xl' : 'h-32 md:h-full md:static relative'}`}>
               
               {/* Name Header */}
               <div className="px-3 py-1.5 md:p-3 bg-white shrink-0 border-b border-slate-100 flex justify-between items-center h-10 md:h-auto">
                 <div className="overflow-hidden">
                    <h2 className="text-sm md:text-2xl font-bold text-slate-900 leading-tight truncate">{names.sanskrit}</h2>
                    <p className="text-slate-500 font-medium text-[10px] md:text-sm truncate hidden xs:block">{names.english}</p>
                 </div>
                 <div className="flex items-center gap-2 shrink-0 ml-2">
                    {mode === 'review' && (
                        <div className="bg-orange-100 text-orange-800 text-[10px] font-bold py-0.5 px-2 rounded">
                        REVIEW
                        </div>
                    )}
                    {/* Expand/Collapse button for mobile */}
                    <button 
                        onClick={() => setMobileImageExpanded(!mobileImageExpanded)}
                        className="md:hidden p-1.5 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200"
                    >
                        {mobileImageExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                 </div>
               </div>

               {/* Image Container */}
               <div className="flex-1 bg-slate-100 relative min-h-0 w-full overflow-hidden">
                 <AsanaImage key={currentAsana.id} asanaId={currentAsana.id} alt={currentAsana.name} />
               </div>

               {/* Region Tabs */}
               {mode === 'practice' && !mobileImageExpanded && (
                  <div className="p-2 bg-white shrink-0 hidden md:block">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      {(['upper-body', 'trunk', 'lower-body'] as Region[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => changeRegion(r)}
                          disabled={isAnswered}
                          className={`flex-1 py-1.5 px-1 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all ${
                            region === r 
                              ? 'bg-white text-teal-700 shadow-sm' 
                              : 'text-slate-400 hover:text-slate-600'
                          } ${isAnswered ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {r.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Mobile Region Tabs (smaller) */}
               {mode === 'practice' && !mobileImageExpanded && (
                  <div className="px-2 py-1 bg-white shrink-0 md:hidden border-t border-slate-100">
                    <div className="flex gap-1 justify-center">
                      {(['upper-body', 'trunk', 'lower-body'] as Region[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => changeRegion(r)}
                          disabled={isAnswered}
                          className={`flex-1 py-1 px-1 rounded text-[9px] font-bold uppercase tracking-wide transition-all border ${
                            region === r 
                              ? 'bg-teal-50 border-teal-200 text-teal-700' 
                              : 'bg-white border-slate-100 text-slate-400'
                          }`}
                        >
                          {r.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
            
            {/* Overlay for mobile expanded image */}
            {mobileImageExpanded && (
                <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setMobileImageExpanded(false)} />
            )}

            {/* Right Panel: Questions (Scrollable) */}
            <div className="md:w-1/2 lg:w-7/12 flex-1 overflow-y-auto bg-slate-50 flex flex-col relative">
              <div className="p-2 md:p-8 max-w-2xl mx-auto w-full space-y-2 md:space-y-3 pb-24 md:pb-8">
                {shuffledOptions.map((opt, idx) => {
                  let statusClass = "border-slate-200 hover:border-teal-300 hover:bg-white bg-white shadow-sm";
                  let icon = null;

                  if (isAnswered) {
                     if (opt.correct) {
                       statusClass = "border-teal-500 bg-teal-50 text-teal-900 ring-1 ring-teal-500";
                       icon = <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-teal-600 flex-shrink-0" />;
                     } else if (opt.id === selectedOptionId) {
                       statusClass = "border-red-300 bg-red-50 text-red-900";
                       icon = <XCircle className="w-4 h-4 md:w-5 md:h-5 text-red-500 flex-shrink-0" />;
                     } else {
                       statusClass = "border-slate-100 bg-slate-50 text-slate-400 opacity-60";
                     }
                  }

                  return (
                    <button
                      key={opt.id}
                      disabled={isAnswered}
                      onClick={() => handleAnswer(opt.id)}
                      className={`w-full text-left p-2 md:p-4 rounded-xl border transition-all duration-200 flex items-start gap-2 md:gap-3 group relative text-[11px] leading-snug xs:text-xs sm:text-sm md:text-base ${statusClass}`}
                    >
                      <span className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold flex-shrink-0 border ${
                        isAnswered && opt.correct ? 'bg-teal-600 border-teal-600 text-white' : 
                        'bg-slate-100 border-slate-300 text-slate-500'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="pt-0.5 text-slate-700">{opt.text}</span>
                      <div className="ml-auto">{icon}</div>
                    </button>
                  );
                })}
              </div>

              {/* Sticky Footer Feedback / Next Button */}
              {isAnswered && (
                <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 p-2 md:p-4 z-10 animate-slide-up shadow-lg">
                  <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-2 md:gap-4">
                     <div className="flex-1 text-xs md:text-sm text-slate-600 hidden md:block">
                        <span className="font-bold text-teal-600 mr-2">CONCEPT:</span> 
                        {getExplanationTerms(correctText).join(", ") || "Alignment Focus"}
                     </div>
                     
                     {(!isCorrect || mode === 'review') ? (
                        <button 
                          onClick={nextQuestion}
                          className="w-full md:w-auto px-6 bg-slate-900 text-white py-2 md:py-3 rounded-lg md:rounded-xl font-bold text-xs md:text-base flex items-center justify-center gap-2 hover:bg-black transition shadow-lg"
                        >
                          {mode === 'review' && reviewIndex >= wrongAnswers.length - 1 ? 'Finish Review' : 'Next Question'} <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                        </button>
                      ) : (
                        <div className="w-full text-center text-teal-600 font-bold text-xs md:text-base animate-pulse py-1 md:py-2">
                          Correct! Moving on...
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
